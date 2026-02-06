import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Check if microphone permission is available
const checkMicrophonePermission = async (): Promise<boolean> => {
  console.log('[Background] Checking microphone permission');

  try {
    // Check if we can access microphone by testing in offscreen
    const existingContexts = await chrome.runtime.getContexts({});
    const offscreenDocument = existingContexts.find((c) => c.contextType === 'OFFSCREEN_DOCUMENT');

    if (offscreenDocument) {
      console.log('[Background] Offscreen document found, sending test-microphone message');
      // Send a message to offscreen to test microphone access
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'test-microphone',
          target: 'offscreen',
        }, (response) => {
          const hasAccess = response?.hasAccess || false;
          console.log('[Background] Microphone permission test result:', hasAccess);
          resolve(hasAccess);
        });
      });
    }

    console.log('[Background] No offscreen document available for permission check');
    return false;
  } catch (error) {
    console.error('[Background] Permission check failed:', error);
    return false;
  }
};

// Open permission request page
const openPermissionPage = async (): Promise<void> => {
  return new Promise((resolve) => {
    chrome.tabs.create({
      url: chrome.runtime.getURL('pages/permission/index.html'),
      active: true
    }, (tab) => {
      if (tab.id) {
        // Listen for tab updates to know when permission is granted
        const onUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
          if (tabId === tab.id && changeInfo.url) {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            chrome.tabs.onRemoved.removeListener(onRemoved);
            resolve();
          }
        };

        const onRemoved = (tabId: number) => {
          if (tabId === tab.id) {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            chrome.tabs.onRemoved.removeListener(onRemoved);
            resolve();
          }
        };

        chrome.tabs.onUpdated.addListener(onUpdated);
        chrome.tabs.onRemoved.addListener(onRemoved);
      } else {
        resolve();
      }
    });
  });
};

const startRecordingOffscreen = async (tabId: number) => {
  console.log('[Background] startRecordingOffscreen called for tab:', tabId);

  const existingContexts = await chrome.runtime.getContexts({});
  let recording = false;

  const offscreenDocument = existingContexts.find((c) => c.contextType === 'OFFSCREEN_DOCUMENT');

  // If an offscreen document is not already open, create one.
  if (!offscreenDocument) {
    console.log('[Background] No offscreen document found, creating one');
    // Create an offscreen document.
    await chrome.offscreen.createDocument({
      url: 'pages/offscreen/index.html',
      reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.DISPLAY_MEDIA],
      justification: 'Recording from chrome.tabCapture API',
    });
    console.log('[Background] Offscreen document created successfully');
  } else {
    recording = offscreenDocument.documentUrl?.endsWith('#recording') ?? false;
    console.log('[Background] Offscreen document already exists, recording state:', recording);
  }

  if (recording) {
    console.log('[Background] Stopping existing recording');
    chrome.runtime.sendMessage({
      type: 'stop-recording',
      target: 'offscreen',
    });
    chrome.action.setIcon({ path: 'assets/icons/32.png' });
    console.log('[Background] Recording stopped, icon updated');
    return;
  }

  // Check microphone permission before starting recording
  const hasMicPermission = await checkMicrophonePermission();

  if (!hasMicPermission) {
    console.log('[Background] Microphone permission not granted, opening permission page');
    await openPermissionPage();

    // Re-check permission after the page was opened
    console.log('[Background] Re-checking microphone permission after permission page');
    const hasPermissionNow = await checkMicrophonePermission();
    if (!hasPermissionNow) {
      console.error('[Background] Microphone permission still not granted after permission page');
      return;
    }
    console.log('[Background] Microphone permission granted');
  } else {
    console.log('[Background] Microphone permission already granted');
  }

  // Get a MediaStream for the active tab.
  console.log('[Background] Getting media stream ID for tab:', tabId);

  const streamId = await new Promise<string>((resolve) => {
    // chrome.tabCapture.getMediaStreamId({ consumerTabId: tabId }, (streamId) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
      resolve(streamId);
    });
  });
  console.log('[Background] Tab capture stream ID obtained:', streamId);

  const micStreamId = await new Promise<string>((resolve) => {
    chrome.tabCapture.getMediaStreamId({ consumerTabId: tabId }, (streamId) => {
      resolve(streamId);
    });
  });
  console.log('[Background] Microphone stream ID obtained:', micStreamId);

  // Send the stream ID to the offscreen document to start recording.
  console.log('[Background] Sending start-recording message to offscreen document');
  chrome.runtime.sendMessage({
    type: 'start-recording',
    target: 'offscreen',
    data: streamId,
    micStreamId,
  });

  console.log('[Background] Updating extension icon to recording state');
  chrome.action.setIcon({ path: '/icons/recording.png' });
  console.log('[Background] Recording initiated successfully');
};

const closeOffscreenDocument = async () => {
  console.log('[Background] Checking for offscreen document to close');

  try {
    const existingContexts = await chrome.runtime.getContexts({});
    const offscreenDocument = existingContexts.find((c) => c.contextType === 'OFFSCREEN_DOCUMENT');

    if (offscreenDocument) {
      console.log('[Background] Offscreen document found, closing it');
      await chrome.offscreen.closeDocument();
      console.log('[Background] Offscreen document closed successfully');
    } else {
      console.log('[Background] No offscreen document to close');
    }
  } catch (error) {
    console.error('[Background] Error closing offscreen document:', error);
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message.action);

  if (message.action === 'startRecording') {
    console.log('[Background] Start recording requested for tab:', message.tabId);
    startRecordingOffscreen(message.tabId);
    return true;
  } else if (message.action === 'stopRecording') {
    console.log('[Background] Stop recording requested for tab:', message.tabId);
    startRecordingOffscreen(message.tabId);
    return true;
  } else if (message.action === 'set-recording') {
    console.log('[Background] Setting recording state:', message.recording);
    chrome.storage.session.set({ recording: message.recording });
  } else if (message.action === 'close-offscreen') {
    console.log('[Background] Close offscreen document requested');
    closeOffscreenDocument();
  } else if (message.action === 'recording-auto-stopped') {
    console.log('[Background] Recording auto-stopped due to:', message.reason);
    console.log('[Background] Recording duration before auto-stop:', message.duration, 'seconds');
    // Update recording state
    chrome.storage.session.set({ recording: false });
    // Store the auto-stop reason so the popup can display it
    chrome.storage.session.set({ 
      recordingAutoStopped: true,
      recordingAutoStopReason: message.reason,
      recordingAutoStopDuration: message.duration
    });
  } else if (message.action === 'upload-to-s3') {
    console.log('[Background] Upload to S3 requested, data size:', message.data?.arrayBuffer?.length || 0, 'bytes');
    handleS3Upload(message.data, sendResponse);
    return true; // Keep the channel open for async response
  }
});

async function getEncryptedDataFromIndexedDB(): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('UploadDB', 1);

    request.onerror = () => {
      reject(new Error('Failed to open UploadDB'));
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('uploads')) {
        db.createObjectStore('uploads');
      }
    };

    request.onsuccess = async (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const transaction = db.transaction(['uploads'], 'readwrite');
      const store = transaction.objectStore('uploads');

      const getRequest = store.get('pending-upload');

      getRequest.onsuccess = async () => {
        const blob = getRequest.result;
        if (!blob) {
          reject(new Error('No pending upload data found in IndexedDB'));
          return;
        }

        console.log('[Background] Retrieved encrypted data from IndexedDB, size:', blob.size, 'bytes');

        // Convert Blob to ArrayBuffer then to Uint8Array
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);

        // Clean up the stored data
        const deleteTransaction = db.transaction(['uploads'], 'readwrite');
        const deleteStore = deleteTransaction.objectStore('uploads');
        deleteStore.delete('pending-upload');

        resolve(buffer);
      };

      getRequest.onerror = () => {
        reject(new Error('Failed to retrieve encrypted data from IndexedDB'));
      };
    };
  });
}

async function handleS3Upload(data: any, sendResponse: (response: any) => void) {
  const startTime = performance.now();

  try {
    console.log('[Background] ===== S3 Upload Process Started =====');
    console.log('[Background] S3 Key:', data.s3Key);
    console.log('[Background] Content Type:', data.contentType);
    console.log('[Background] Using IndexedDB:', data.useIndexedDB || false);

    // Get AWS credentials from storage
    console.log('[Background] Fetching AWS credentials from storage');
    const config = await chrome.storage.sync.get([
      'awsAccessKeyId',
      'awsSecretAccessKey',
      'awsRegion',
      's3Bucket'
    ]);

    if (!config.awsAccessKeyId || !config.awsSecretAccessKey) {
      console.error('[Background] AWS credentials missing in configuration');
      sendResponse({ success: false, error: 'AWS credentials not configured' });
      return;
    }

    console.log('[Background] AWS credentials found');
    console.log('[Background] AWS Region:', config.awsRegion || 'eu-west-3');
    console.log('[Background] S3 Bucket:', config.s3Bucket || 'occupational-health-medical-conversation-recordings');

    console.log('[Background] Initializing S3 client');
    const s3Client = new S3Client({
      region: config.awsRegion || 'eu-west-3',
      credentials: {
        accessKeyId: config.awsAccessKeyId,
        secretAccessKey: config.awsSecretAccessKey
      }
    });
    console.log('[Background] S3 client initialized successfully');

    // Get the buffer - either from IndexedDB or from the message data (for backward compatibility)
    let buffer: Uint8Array;
    if (data.useIndexedDB) {
      console.log('[Background] Reading encrypted data from IndexedDB');
      buffer = await getEncryptedDataFromIndexedDB();
    } else {
      // Legacy support: convert array back to Uint8Array
      console.log('[Background] Converting array data to Uint8Array buffer');
      buffer = new Uint8Array(data.arrayBuffer);
    }
    console.log('[Background] Buffer size:', buffer.length, 'bytes');

    console.log('[Background] Creating PutObjectCommand');
    const command = new PutObjectCommand({
      Bucket: config.s3Bucket || 'occupational-health-medical-conversation-recordings',
      Key: data.s3Key,
      Body: buffer,
      ContentType: data.contentType,
      Metadata: {
        'uploaded-by': 'chrome-extension',
        'timestamp': data.timestamp
      }
    });

    console.log('[Background] Uploading to S3...');
    const uploadStartTime = performance.now();
    await s3Client.send(command);
    const uploadTime = ((performance.now() - uploadStartTime) / 1000).toFixed(2);
    console.log('[Background] Upload completed in', uploadTime, 'seconds');

    const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log('[Background] ===== S3 Upload Process Completed Successfully =====');
    console.log('[Background] Total time:', totalTime, 'seconds');
    console.log('[Background] File location: s3://' + (config.s3Bucket || 'occupational-health-medical-conversation-recordings') + '/' + data.s3Key);

    sendResponse({ success: true, s3Key: data.s3Key });
  } catch (error) {
    const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
    console.error('[Background] ===== S3 Upload Failed =====');
    console.error('[Background] Error type:', (error as Error).name);
    console.error('[Background] Error message:', (error as Error).message);
    console.error('[Background] Error details:', error);
    console.error('[Background] Failed after', totalTime, 'seconds');
    sendResponse({ success: false, error: (error as Error).message });
  }
}

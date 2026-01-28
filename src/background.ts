import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Check if microphone permission is available
const checkMicrophonePermission = async (): Promise<boolean> => {
  try {
    // Check if we can access microphone by testing in offscreen
    const existingContexts = await chrome.runtime.getContexts({});
    const offscreenDocument = existingContexts.find((c) => c.contextType === 'OFFSCREEN_DOCUMENT');

    if (offscreenDocument) {
      // Send a message to offscreen to test microphone access
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'test-microphone',
          target: 'offscreen',
        }, (response) => {
          resolve(response?.hasAccess || false);
        });
      });
    }

    return false;
  } catch (error) {
    console.error('Permission check failed:', error);
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
  const existingContexts = await chrome.runtime.getContexts({});
  let recording = false;

  const offscreenDocument = existingContexts.find((c) => c.contextType === 'OFFSCREEN_DOCUMENT');

  // If an offscreen document is not already open, create one.
  if (!offscreenDocument) {
    console.error('OFFSCREEN no offscreen document');
    // Create an offscreen document.
    await chrome.offscreen.createDocument({
      url: 'pages/offscreen/index.html',
      reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.DISPLAY_MEDIA],
      justification: 'Recording from chrome.tabCapture API',
    });
  } else {
    recording = offscreenDocument.documentUrl?.endsWith('#recording') ?? false;
  }

  if (recording) {
    chrome.runtime.sendMessage({
      type: 'stop-recording',
      target: 'offscreen',
    });
    chrome.action.setIcon({ path: 'icons/not-recording.png' });
    return;
  }

  // Check microphone permission before starting recording
  const hasMicPermission = await checkMicrophonePermission();

  if (!hasMicPermission) {
    console.log('Microphone permission not granted, opening permission page...');
    await openPermissionPage();

    // Re-check permission after the page was opened
    const hasPermissionNow = await checkMicrophonePermission();
    if (!hasPermissionNow) {
      console.error('Microphone permission still not granted');
      return;
    }
  }

  // Get a MediaStream for the active tab.
  console.error('BACKGROUND getMediaStreamId');

  const streamId = await new Promise<string>((resolve) => {
    // chrome.tabCapture.getMediaStreamId({ consumerTabId: tabId }, (streamId) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
      resolve(streamId);
    });
  });
  console.error('BACKGROUND streamId', streamId);

  const micStreamId = await new Promise<string>((resolve) => {
    chrome.tabCapture.getMediaStreamId({ consumerTabId: tabId }, (streamId) => {
      resolve(streamId);
    });
  });
  console.error('BACKGROUND micStreamId', micStreamId);

  // Send the stream ID to the offscreen document to start recording.
  chrome.runtime.sendMessage({
    type: 'start-recording',
    target: 'offscreen',
    data: streamId,
    micStreamId,
  });

  chrome.action.setIcon({ path: '/icons/recording.png' });
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startRecording') {
    console.error('startRecording in background', JSON.stringify(message));
    startRecordingOffscreen(message.tabId);
    // startRecording(message.tabId, message.orgId);
    return true;
  } else if (message.action === 'stopRecording') {
    console.error('stopRecording in background');
    startRecordingOffscreen(message.tabId);
    return true;
  } else if (message.action === 'set-recording') {
    console.error('set-recording in background', message.recording);
    chrome.storage.session.set({ recording: message.recording });
  } else if (message.action === 'upload-to-s3') {
    console.log('[Background] Received upload-to-s3 request');
    handleS3Upload(message.data, sendResponse);
    return true; // Keep the channel open for async response
  }
});

async function handleS3Upload(data: any, sendResponse: (response: any) => void) {
  try {
    console.log('[Background] Starting S3 upload');

    // Get AWS credentials from storage
    console.log('[Background] Fetching AWS credentials');
    const config = await chrome.storage.sync.get([
      'awsAccessKeyId',
      'awsSecretAccessKey',
      'awsRegion',
      's3Bucket'
    ]);

    if (!config.awsAccessKeyId || !config.awsSecretAccessKey) {
      console.error('[Background] AWS credentials not configured');
      sendResponse({ success: false, error: 'AWS credentials not configured' });
      return;
    }

    console.log('[Background] Initializing S3 client');
    const s3Client = new S3Client({
      region: config.awsRegion || 'eu-west-3',
      credentials: {
        accessKeyId: config.awsAccessKeyId,
        secretAccessKey: config.awsSecretAccessKey
      }
    });

    // Convert array back to Uint8Array
    console.log('[Background] Converting data to buffer');
    const buffer = new Uint8Array(data.arrayBuffer);

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
    await s3Client.send(command);
    console.log('[Background] Upload successful');

    sendResponse({ success: true, s3Key: data.s3Key });
  } catch (error) {
    console.error('[Background] Upload error:', error);
    sendResponse({ success: false, error: (error as Error).message });
  }
}

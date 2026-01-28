/*
 * Sample code for offscreen document:
 *  https://github.com/GoogleChrome/chrome-extensions-samples/blob/main/functional-samples/sample.tabcapture-recorder
 */

import React, { useEffect } from 'react';

const App: React.FC = () => {
  useEffect(() => {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.target === 'offscreen') {
        switch (message.type) {
          case 'start-recording':
            console.error('OFFSCREEN start-recording');
            startRecording(message.data, message.orgId, message.micStreamId);
            break;
          case 'stop-recording':
            console.error('OFFSCREEN stop-recording');
            stopRecording();
            break;
          case 'test-microphone':
            console.log('OFFSCREEN test-microphone');
            testMicrophoneAccess().then(hasAccess => {
              sendResponse({ hasAccess });
            });
            return true; // Keep the message channel open for async response
          default:
            throw new Error(`Unrecognized message: ${message.type}`);
        }
      }
    });
  }, []);

  let recorder: MediaRecorder | undefined;
  let data: Blob[] = [];
  let tabMedia: MediaStream | undefined;
  let micMedia: MediaStream | undefined;
  let audioContext: AudioContext | undefined;

  // Test if microphone access is available
  async function testMicrophoneAccess(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.log('Microphone access test failed:', error);
      return false;
    }
  }

  async function saveBlobToIndexedDB(blob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('RecordingDB', 1);

      request.onerror = () => reject(request.error);

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = db.transaction(['recordings'], 'readwrite');
        const objectStore = transaction.objectStore('recordings');
        const putRequest = objectStore.put(blob, 'latest');

        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('recordings')) {
          db.createObjectStore('recordings');
        }
      };
    });
  }

  async function startRecording(streamId: string, orgId: string, micStreamId: string) {
    if (recorder?.state === 'recording') {
      throw new Error('Called startRecording while recording is in progress.');
    }

    tabMedia = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    } as any);
    console.error('OFFSCREEN media', tabMedia);

    // Try to get microphone access for recording
    try {
      micMedia = await navigator.mediaDevices.getUserMedia({
        audio: true, // Request actual microphone, not tab audio
        video: false,
      });
      console.log('OFFSCREEN microphone access granted', micMedia);
    } catch (error) {
      console.log('OFFSCREEN microphone access failed:', error);
      micMedia = undefined;
      // Continue without microphone - just record tab audio
    }

    // Continue to play the captured audio to the user.
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(tabMedia);

    const destination = audioContext.createMediaStreamDestination();

    source.connect(audioContext.destination);
    source.connect(destination);

    // If we have microphone access, mix it in
    if (micMedia) {
      const micSource = audioContext.createMediaStreamSource(micMedia);
      micSource.connect(destination);
      console.log('OFFSCREEN microphone mixed into recording');
    }

    console.error('OFFSCREEN output', audioContext);

    // Start recording.
    recorder = new MediaRecorder(destination.stream, { mimeType: 'video/webm' });
    recorder.ondataavailable = (event: any) => data.push(event.data);
    recorder.onstop = async () => {
      const blob = new Blob(data, { type: 'video/webm' });

      // delete local state of recording
      chrome.runtime.sendMessage({
        action: 'set-recording',
        recording: false,
      });

      try {
        // Save blob to IndexedDB
        await saveBlobToIndexedDB(blob);
        console.log('Blob saved to IndexedDB');

        // Open upload page which will handle the S3 upload
        window.open(chrome.runtime.getURL('pages/upload/index.html'), '_blank');
      } catch (error) {
        console.error('Failed to save blob:', error);
        // Fallback to just opening the blob
        window.open(URL.createObjectURL(blob), '_blank');
      }

      // Clean up all media streams and audio context
      if (tabMedia) {
        tabMedia.getTracks().forEach(track => track.stop());
        tabMedia = undefined;
      }
      if (micMedia) {
        micMedia.getTracks().forEach(track => track.stop());
        micMedia = undefined;
      }
      if (audioContext) {
        audioContext.close();
        audioContext = undefined;
      }

      // Clear state ready for next recording
      recorder = undefined;
      data = [];
    };
    recorder.start();

    console.error('OFFSCREEN recorder started', recorder);

    chrome.runtime.sendMessage({
      action: 'set-recording',
      recording: true,
    });

    // Record the current state in the URL. This provides a very low-bandwidth
    // way of communicating with the service worker (the service worker can check
    // the URL of the document and see the current recording state). We can't
    // store that directly in the service worker as it may be terminated while
    // recording is in progress. We could write it to storage but that slightly
    // increases the risk of things getting out of sync.
    window.location.hash = 'recording';
  }

  async function stopRecording() {
    recorder?.stop();

    // Stopping the tracks makes sure the recording icon in the tab is removed.
    recorder?.stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());

    // Also clean up the original media streams
    if (tabMedia) {
      tabMedia.getTracks().forEach(track => track.stop());
    }
    if (micMedia) {
      micMedia.getTracks().forEach(track => track.stop());
    }
    if (audioContext) {
      audioContext.close();
    }

    // Update current state in URL
    window.location.hash = '';

    // Note: In a real extension, you would want to write the recording to a more
    // permanent location (e.g IndexedDB) and then close the offscreen document,
    // to avoid keeping a document around unnecessarily. Here we avoid that to
    // make sure the browser keeps the Object URL we create (see above) and to
    // keep the sample fairly simple to follow.
  }

  return <div></div>;
};

export default App;

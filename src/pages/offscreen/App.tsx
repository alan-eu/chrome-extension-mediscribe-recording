/*
 * Sample code for offscreen document:
 *  https://github.com/GoogleChrome/chrome-extensions-samples/blob/main/functional-samples/sample.tabcapture-recorder
 */

import React, { useEffect } from 'react';

const App: React.FC = () => {
  useEffect(() => {
    console.log('[Offscreen] Document initialized and listening for messages');

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.target === 'offscreen') {
        console.log('[Offscreen] Received message:', message.type);

        switch (message.type) {
          case 'start-recording':
            console.log('[Offscreen] Starting recording with streamId:', message.data, 'orgId:', message.orgId);
            startRecording(message.data, message.orgId, message.micStreamId);
            break;
          case 'stop-recording':
            console.log('[Offscreen] Stopping recording');
            stopRecording();
            break;
          case 'test-microphone':
            console.log('[Offscreen] Testing microphone access');
            testMicrophoneAccess().then(hasAccess => {
              console.log('[Offscreen] Microphone access test result:', hasAccess);
              sendResponse({ hasAccess });
            });
            return true; // Keep the message channel open for async response
          default:
            console.error('[Offscreen] Unrecognized message type:', message.type);
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
  let scriptProcessor: ScriptProcessorNode | undefined;
  let recordedBuffers: Float32Array[] = [];

  // Test if microphone access is available
  async function testMicrophoneAccess(): Promise<boolean> {
    try {
      console.log('[Offscreen] Requesting microphone permission for test');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[Offscreen] Microphone access granted, tracks:', stream.getAudioTracks().length);
      stream.getTracks().forEach(track => track.stop());
      console.log('[Offscreen] Test stream stopped');
      return true;
    } catch (error) {
      console.error('[Offscreen] Microphone access test failed:', error);
      return false;
    }
  }

  // Create WAV file header
  function createWavHeader(dataLength: number, sampleRate: number, numChannels: number): ArrayBuffer {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');

    // FMT sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate
    view.setUint16(32, numChannels * 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample

    // Data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    return buffer;
  }

  function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // Convert Float32Array to Int16Array (PCM 16-bit)
  function floatTo16BitPCM(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
  }

  // Resample audio to target sample rate
  function resampleAudio(audioBuffer: Float32Array, fromSampleRate: number, toSampleRate: number): Float32Array {
    if (fromSampleRate === toSampleRate) {
      return audioBuffer;
    }

    const ratio = fromSampleRate / toSampleRate;
    const newLength = Math.round(audioBuffer.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, audioBuffer.length - 1);
      const t = srcIndex - srcIndexFloor;
      result[i] = audioBuffer[srcIndexFloor] * (1 - t) + audioBuffer[srcIndexCeil] * t;
    }

    return result;
  }

  // Create WAV blob from recorded buffers
  function createWavBlob(buffers: Float32Array[], sourceSampleRate: number): Blob {
    console.log('[Offscreen] Creating WAV blob from', buffers.length, 'audio buffers');
    console.log('[Offscreen] Source sample rate:', sourceSampleRate, 'Hz');

    const targetSampleRate = 16000; // 16kHz
    const numChannels = 1; // Mono

    // Resample all buffers to 16kHz
    console.log('[Offscreen] Resampling audio from', sourceSampleRate, 'Hz to', targetSampleRate, 'Hz');
    const resampledBuffers = buffers.map(buffer => resampleAudio(buffer, sourceSampleRate, targetSampleRate));

    // Concatenate all buffers
    const totalLength = resampledBuffers.reduce((acc, buffer) => acc + buffer.length, 0);
    console.log('[Offscreen] Total audio samples after resampling:', totalLength);
    const concatenated = new Float32Array(totalLength);
    let offset = 0;
    for (const buffer of resampledBuffers) {
      concatenated.set(buffer, offset);
      offset += buffer.length;
    }

    // Convert to 16-bit PCM
    console.log('[Offscreen] Converting float32 to 16-bit PCM');
    const pcmData = floatTo16BitPCM(concatenated);

    // Create WAV header
    const header = createWavHeader(pcmData.length * 2, targetSampleRate, numChannels);

    // Combine header and data
    const headerArray = new Uint8Array(header);
    const dataArray = new Uint8Array(pcmData.buffer as ArrayBuffer);
    const wavBlob = new Blob([headerArray, dataArray], { type: 'audio/wav' });

    const durationSeconds = (totalLength / targetSampleRate).toFixed(2);
    console.log('[Offscreen] WAV file created:', {
      size: wavBlob.size + ' bytes',
      duration: durationSeconds + ' seconds',
      sampleRate: targetSampleRate + ' Hz',
      channels: numChannels,
      format: '16-bit PCM'
    });

    return wavBlob;
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
    console.log('[Offscreen] startRecording called with streamId:', streamId);

    if (recorder?.state === 'recording') {
      console.error('[Offscreen] Recording already in progress, aborting');
      throw new Error('Called startRecording while recording is in progress.');
    }

    console.log('[Offscreen] Capturing tab audio stream');
    tabMedia = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    } as any);
    console.log('[Offscreen] Tab audio captured successfully, tracks:', tabMedia.getAudioTracks().length);

    // Try to get microphone access for recording
    try {
      console.log('[Offscreen] Requesting microphone access for recording');
      micMedia = await navigator.mediaDevices.getUserMedia({
        audio: true, // Request actual microphone, not tab audio
        video: false,
      });
      console.log('[Offscreen] Microphone access granted for recording, tracks:', micMedia.getAudioTracks().length);
    } catch (error) {
      console.warn('[Offscreen] Microphone access failed, continuing with tab audio only:', error);
      micMedia = undefined;
      // Continue without microphone - just record tab audio
    }

    // Continue to play the captured audio to the user.
    console.log('[Offscreen] Creating AudioContext for audio processing');
    audioContext = new AudioContext();
    console.log('[Offscreen] AudioContext sample rate:', audioContext.sampleRate, 'Hz');
    const source = audioContext.createMediaStreamSource(tabMedia);

    // Create a merger to mix tab and mic audio
    console.log('[Offscreen] Setting up audio routing for tab audio');
    const merger = audioContext.createChannelMerger(2);
    const splitter = audioContext.createChannelSplitter(2);

    source.connect(splitter);
    splitter.connect(merger, 0, 0);
    splitter.connect(merger, 1, 1);

    // Note: We intentionally do NOT connect source to audioContext.destination
    // to avoid playing back the audio through speakers (which causes echo/delay)
    console.log('[Offscreen] Tab audio NOT connected to speakers (no playback)');

    // If we have microphone access, mix it in
    if (micMedia) {
      console.log('[Offscreen] Mixing microphone audio into recording');
      const micSource = audioContext.createMediaStreamSource(micMedia);
      const micSplitter = audioContext.createChannelSplitter(2);
      micSource.connect(micSplitter);
      micSplitter.connect(merger, 0, 0);
      micSplitter.connect(merger, 1, 1);
      console.log('[Offscreen] Microphone successfully mixed with tab audio');
    } else {
      console.log('[Offscreen] Recording tab audio only (no microphone)');
    }

    // Create gain node to convert to mono
    const gainNode = audioContext.createGain();
    merger.connect(gainNode);

    // Create script processor to capture audio data
    const bufferSize = 4096;
    console.log('[Offscreen] Creating ScriptProcessorNode with buffer size:', bufferSize);
    scriptProcessor = audioContext.createScriptProcessor(bufferSize, 2, 1);
    recordedBuffers = [];
    console.log('[Offscreen] Audio buffer collection initialized');

    let processedBufferCount = 0;
    const logInterval = 500; // Log every 500 buffers (~45 seconds at 4096 buffer size and 48kHz)

    scriptProcessor.onaudioprocess = (event) => {
      const inputBuffer = event.inputBuffer;
      const outputBuffer = event.outputBuffer;

      // Mix stereo to mono
      const left = inputBuffer.getChannelData(0);
      const right = inputBuffer.getChannelData(1);
      const mono = new Float32Array(left.length);

      for (let i = 0; i < left.length; i++) {
        mono[i] = (left[i] + right[i]) / 2;
      }

      recordedBuffers.push(new Float32Array(mono));
      processedBufferCount++;

      // Log progress periodically
      if (processedBufferCount % logInterval === 0) {
        const recordedSeconds = ((processedBufferCount * bufferSize) / audioContext!.sampleRate).toFixed(1);
        console.log('[Offscreen] Recording progress:', recordedSeconds, 'seconds,', recordedBuffers.length, 'buffers captured');
      }

      // Copy input to output for passthrough
      for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
        const outputData = outputBuffer.getChannelData(channel);
        outputData.set(inputBuffer.getChannelData(Math.min(channel, inputBuffer.numberOfChannels - 1)));
      }
    };

    gainNode.connect(scriptProcessor);
    
    // Connect scriptProcessor to a silent gain node instead of destination
    // This allows audio processing without playback (avoids echo/delay)
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    scriptProcessor.connect(silentGain);
    silentGain.connect(audioContext.destination);

    console.log('[Offscreen] Audio processing pipeline connected (no playback)');

    // Store a flag to indicate recording is active
    const isRecording = { value: true };

    // Handle stop
    const stopHandler = async () => {
      console.log('[Offscreen] Stop handler called');

      if (!isRecording.value) {
        console.warn('[Offscreen] Stop called but recording is not active');
        return;
      }
      isRecording.value = false;

      console.log('[Offscreen] Stopping recording, total buffers captured:', recordedBuffers.length);
      const blob = createWavBlob(recordedBuffers, audioContext!.sampleRate);

      // delete local state of recording
      console.log('[Offscreen] Updating recording state in background');
      chrome.runtime.sendMessage({
        action: 'set-recording',
        recording: false,
      });

      try {
        // Save blob to IndexedDB
        console.log('[Offscreen] Saving recording to IndexedDB, size:', blob.size, 'bytes');
        await saveBlobToIndexedDB(blob);
        console.log('[Offscreen] Recording saved to IndexedDB successfully');

        // Open upload page which will handle the S3 upload
        const uploadPageUrl = chrome.runtime.getURL('pages/upload/index.html');
        console.log('[Offscreen] Opening upload page:', uploadPageUrl);
        window.open(uploadPageUrl, '_blank');
      } catch (error) {
        console.error('[Offscreen] Failed to save blob to IndexedDB:', error);
        // Fallback to just opening the blob
        console.log('[Offscreen] Falling back to direct blob URL');
        window.open(URL.createObjectURL(blob), '_blank');
      }

      // Clean up all media streams and audio context
      console.log('[Offscreen] Cleaning up audio resources');
      if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor.onaudioprocess = null;
        scriptProcessor = undefined;
        console.log('[Offscreen] ScriptProcessorNode disconnected');
      }
      if (tabMedia) {
        const trackCount = tabMedia.getTracks().length;
        tabMedia.getTracks().forEach(track => track.stop());
        tabMedia = undefined;
        console.log('[Offscreen] Tab audio tracks stopped:', trackCount);
      }
      if (micMedia) {
        const trackCount = micMedia.getTracks().length;
        micMedia.getTracks().forEach(track => track.stop());
        micMedia = undefined;
        console.log('[Offscreen] Microphone tracks stopped:', trackCount);
      }
      if (audioContext) {
        await audioContext.close();
        audioContext = undefined;
        console.log('[Offscreen] AudioContext closed');
      }

      // Clear state ready for next recording
      recordedBuffers = [];
      recorder = undefined;
      console.log('[Offscreen] Recording cleanup complete');

      // Signal to background that we're done and can close the offscreen document
      console.log('[Offscreen] Notifying background to close offscreen document');
      chrome.runtime.sendMessage({
        action: 'close-offscreen',
      });
    };

    // Create a recorder-like object for compatibility
    recorder = {
      state: 'recording' as any,
      stop: stopHandler,
      stream: null as any
    } as any;

    console.log('[Offscreen] Recording started successfully');

    console.log('[Offscreen] Notifying background that recording is active');
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
    console.log('[Offscreen] URL hash set to "recording" for state tracking');
  }

  async function stopRecording() {
    console.log('[Offscreen] stopRecording function called');

    if (recorder && typeof recorder.stop === 'function') {
      console.log('[Offscreen] Calling recorder stop handler');
      await recorder.stop();
    } else {
      console.warn('[Offscreen] No recorder found or stop function not available');
    }

    // Update current state in URL
    window.location.hash = '';
    console.log('[Offscreen] URL hash cleared');

    // Note: In a real extension, you would want to write the recording to a more
    // permanent location (e.g IndexedDB) and then close the offscreen document,
    // to avoid keeping a document around unnecessarily. Here we avoid that to
    // make sure the browser keeps the Object URL we create (see above) and to
    // keep the sample fairly simple to follow.
  }

  return <div></div>;
};

export default App;

import React, { useEffect, useState, useRef } from 'react';
import { encryptData, decryptData } from '../../utils/crypto';

type UploadStatus = 'loading' | 'uploading' | 'success' | 'error';

interface UploadState {
  status: UploadStatus;
  message: string;
  s3Key?: string;
  error?: string;
}

const App: React.FC = () => {
  const [uploadState, setUploadState] = useState<UploadState>({
    status: 'loading',
    message: 'Retrieving recording from database...'
  });
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) {
      console.log('[Upload Page] Already started, skipping');
      return;
    }

    console.log('[Upload Page] Component mounted, starting upload process');
    hasStarted.current = true;
    handleUpload();
  }, []);

  const handleOpenRecording = () => {
    if (blobUrl) {
      console.log('[Upload] Opening recording in new tab');
      window.open(blobUrl, '_blank');
    }
  };

  async function uploadToS3ViaBackground(blob: Blob, encryptionKey: string, healthProfessionalId: string): Promise<string> {
    console.log('[Upload] Starting S3 upload via background script, blob size:', blob.size);

    // Generate filename and S3 key using health professional ID and timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${healthProfessionalId}_${timestamp}.wav.enc`;
    const s3Key = `chrome-extension-audio-recordings/${filename}`;

    console.log('[Upload] Generated S3 key:', s3Key);

    // Convert blob to array buffer
    console.log('[Upload] Converting blob to ArrayBuffer');
    const arrayBuffer = await blob.arrayBuffer();
    console.log('[Upload] ArrayBuffer size:', arrayBuffer.byteLength, 'bytes');

    // Encrypt the data
    console.log('[Upload] Encrypting data...');
    const encryptedData = await encryptData(arrayBuffer, encryptionKey);
    console.log('[Upload] Encrypted data size:', encryptedData.byteLength, 'bytes');

    // Send to background script
    console.log('[Upload] Sending message to background script');
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'upload-to-s3',
        data: {
          arrayBuffer: Array.from(new Uint8Array(encryptedData)),
          s3Key,
          contentType: 'application/octet-stream',
          timestamp: new Date().toISOString()
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Upload] Chrome runtime error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        console.log('[Upload] Received response from background:', response);

        if (response && response.success) {
          console.log('[Upload] Upload successful:', response.s3Key);
          resolve(response.s3Key);
        } else {
          console.error('[Upload] Upload failed:', response?.error);
          reject(new Error(response?.error || 'Upload failed'));
        }
      });
    });
  }

  async function handleUpload() {
    try {
      console.log('[Upload] Starting upload process');

      // Open IndexedDB to retrieve the blob
      console.log('[Upload] Opening IndexedDB');
      const request = indexedDB.open('RecordingDB', 1);

      request.onerror = () => {
        console.error('[Upload] IndexedDB open error:', request.error);
        setUploadState({
          status: 'error',
          message: 'Failed to access recording database',
          error: request.error?.message
        });
      };

      request.onsuccess = async (event) => {
        console.log('[Upload] IndexedDB opened successfully');
        const db = (event.target as IDBOpenDBRequest).result;

        console.log('[Upload] Creating transaction');
        const transaction = db.transaction(['recordings'], 'readonly');
        const objectStore = transaction.objectStore('recordings');

        console.log('[Upload] Getting blob from store');
        const getRequest = objectStore.get('latest');

        getRequest.onsuccess = async () => {
          const blob = getRequest.result;

          console.log('[Upload] Blob retrieved:', blob ? `${blob.size} bytes` : 'null');

          if (!blob) {
            console.error('[Upload] No recording found in database');
            setUploadState({
              status: 'error',
              message: 'No recording found',
              error: 'The recording database is empty'
            });
            return;
          }

          try {
            // Get encryption key and health professional ID from storage
            console.log('[Upload] Getting config from storage');
            const config = await chrome.storage.sync.get(['encryptionKey', 'healthProfessionalId']);

            if (!config.encryptionKey) {
              throw new Error('Encryption key not configured. Please configure it in settings.');
            }

            if (!config.healthProfessionalId) {
              throw new Error('Health Professional ID not configured. Please configure it in settings.');
            }

            console.log('[Upload] Setting status to uploading');
            setUploadState({
              status: 'uploading',
              message: 'Encrypting and uploading recording to S3...'
            });

            const s3Key = await uploadToS3ViaBackground(blob, config.encryptionKey, config.healthProfessionalId);

            console.log('[Upload] Upload successful, setting success state');

            // Store blob URL for later use (unencrypted for playback)
            const url = URL.createObjectURL(blob);
            setBlobUrl(url);

            setUploadState({
              status: 'success',
              message: 'Upload successful!',
              s3Key
            });

            // Clean up the database
            console.log('[Upload] Cleaning up database');
            const deleteTransaction = db.transaction(['recordings'], 'readwrite');
            const deleteStore = deleteTransaction.objectStore('recordings');
            deleteStore.delete('latest');

          } catch (error) {
            console.error('[Upload] Upload failed:', error);

            // Store blob URL even if upload failed
            const url = URL.createObjectURL(blob);
            setBlobUrl(url);

            setUploadState({
              status: 'error',
              message: 'Upload failed',
              error: (error as Error).message
            });
          }
        };

        getRequest.onerror = () => {
          console.error('[Upload] Failed to retrieve blob:', getRequest.error);
          setUploadState({
            status: 'error',
            message: 'Failed to retrieve recording',
            error: getRequest.error?.message
          });
        };
      };

      request.onupgradeneeded = (event) => {
        console.log('[Upload] Upgrading database schema');
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('recordings')) {
          console.log('[Upload] Creating recordings object store');
          db.createObjectStore('recordings');
        }
      };

    } catch (error) {
      console.error('[Upload] Error in handleUpload:', error);
      setUploadState({
        status: 'error',
        message: 'An error occurred',
        error: (error as Error).message
      });
    }
  }

  return (
    <div className="container">
      {uploadState.status === 'loading' && (
        <div>
          <div className="spinner"></div>
          <p>{uploadState.message}</p>
        </div>
      )}

      {uploadState.status === 'uploading' && (
        <div>
          <div className="spinner"></div>
          <p>{uploadState.message}</p>
        </div>
      )}

      {uploadState.status === 'success' && (
        <div>
          <p className="success">✓ {uploadState.message}</p>
          {uploadState.s3Key && <p>File: {uploadState.s3Key}</p>}
          {blobUrl && (
            <button
              onClick={handleOpenRecording}
              style={{
                marginTop: '20px',
                padding: '10px 20px',
                backgroundColor: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              🎵 Open Recording
            </button>
          )}
        </div>
      )}

      {uploadState.status === 'error' && (
        <div>
          <p className="error">{uploadState.message}</p>
          {uploadState.error && <p className="error">{uploadState.error}</p>}
          {blobUrl && (
            <button
              onClick={handleOpenRecording}
              style={{
                marginTop: '20px',
                padding: '10px 20px',
                backgroundColor: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              🎵 Open Recording
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default App;

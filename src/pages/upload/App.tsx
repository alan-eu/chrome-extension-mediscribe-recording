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
  const blobRef = useRef<Blob | null>(null);
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
    if (blobRef.current) {
      console.log('[Upload] Downloading recording file');
      // Create a fresh blob URL from the stored blob
      const url = URL.createObjectURL(blobRef.current);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'recording.wav';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke the URL after a short delay
      setTimeout(() => URL.revokeObjectURL(url), 100);
    }
  };

  const handleRetryUpload = () => {
    console.log('[Upload] Retrying upload');
    setUploadState({
      status: 'loading',
      message: 'Retrying upload...'
    });
    handleUpload();
  };

  async function storeEncryptedDataInIndexedDB(encryptedData: ArrayBuffer): Promise<void> {
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

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = db.transaction(['uploads'], 'readwrite');
        const store = transaction.objectStore('uploads');

        // Store as Blob to avoid memory issues with large ArrayBuffers
        const blob = new Blob([encryptedData], { type: 'application/octet-stream' });
        const putRequest = store.put(blob, 'pending-upload');

        putRequest.onsuccess = () => {
          console.log('[Upload] Encrypted data stored in IndexedDB');
          resolve();
        };

        putRequest.onerror = () => {
          reject(new Error('Failed to store encrypted data in IndexedDB'));
        };
      };
    });
  }

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

    // Store encrypted data in IndexedDB to avoid 64MB message size limit
    console.log('[Upload] Storing encrypted data in IndexedDB to bypass message size limit');
    await storeEncryptedDataInIndexedDB(encryptedData);

    // Send message to background script (without the large data)
    console.log('[Upload] Sending message to background script');
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'upload-to-s3',
        data: {
          s3Key,
          contentType: 'application/octet-stream',
          timestamp: new Date().toISOString(),
          useIndexedDB: true  // Signal to background to read from IndexedDB
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

  // Helper function to get file path from IndexedDB
  async function getFilePathFromIndexedDB(): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('RecordingDB', 1);

      request.onerror = () => {
        console.error('[Upload] IndexedDB open error:', request.error);
        reject(new Error(request.error?.message || 'Failed to open IndexedDB'));
      };

      request.onupgradeneeded = (event) => {
        console.log('[Upload] Upgrading database schema');
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('recordings')) {
          console.log('[Upload] Creating recordings object store');
          db.createObjectStore('recordings');
        }
      };

      request.onsuccess = (event) => {
        console.log('[Upload] IndexedDB opened successfully');
        const db = (event.target as IDBOpenDBRequest).result;

        // Check if the object store exists
        if (!db.objectStoreNames.contains('recordings')) {
          console.log('[Upload] recordings object store does not exist');
          db.close();
          resolve(null);
          return;
        }

        const transaction = db.transaction(['recordings'], 'readonly');
        const objectStore = transaction.objectStore('recordings');

        console.log('[Upload] Getting file path from store');
        const getRequest = objectStore.get('filePath');

        getRequest.onsuccess = () => {
          const filePath = getRequest.result;
          console.log('[Upload] File path retrieved:', filePath || 'null');
          db.close();
          resolve(filePath || null);
        };

        getRequest.onerror = () => {
          console.error('[Upload] Failed to retrieve file path:', getRequest.error);
          db.close();
          reject(new Error(getRequest.error?.message || 'Failed to retrieve file path'));
        };
      };
    });
  }

  // Get recording file from OPFS (Origin Private File System)
  async function getRecordingFileFromOPFS(): Promise<Blob | null> {
    try {
      console.log('[Upload] Getting recording from temporary storage');

      // Get file path from IndexedDB
      const fileName = await getFilePathFromIndexedDB();
      if (!fileName) {
        console.error('[Upload] No file name found in IndexedDB');
        return null;
      }

      console.log('[Upload] Looking for file:', fileName);

      // Get OPFS root
      const opfsRoot = await navigator.storage.getDirectory();

      // Get the file handle
      const fileHandle = await opfsRoot.getFileHandle(fileName);
      const file = await fileHandle.getFile();

      console.log('[Upload] File retrieved from OPFS:', file.name, 'size:', file.size, 'bytes');

      return file;
    } catch (error) {
      console.error('[Upload] Failed to retrieve file from OPFS:', error);
      return null;
    }
  }

  // Helper function to delete file path from IndexedDB
  async function deleteFilePathFromIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('RecordingDB', 1);

      request.onerror = () => reject(new Error('Failed to open IndexedDB for cleanup'));

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('recordings')) {
          db.close();
          resolve();
          return;
        }

        const transaction = db.transaction(['recordings'], 'readwrite');
        const objectStore = transaction.objectStore('recordings');
        const deleteRequest = objectStore.delete('filePath');

        deleteRequest.onsuccess = () => {
          console.log('[Upload] File path deleted from database');
          db.close();
          resolve();
        };
        deleteRequest.onerror = () => {
          db.close();
          reject(new Error('Failed to delete file path'));
        };
      };
    });
  }

  // Helper function to delete the recording file from OPFS
  async function deleteFileFromOPFS(fileName: string): Promise<void> {
    try {
      console.log('[Upload] Deleting file from OPFS:', fileName);
      const opfsRoot = await navigator.storage.getDirectory();
      await opfsRoot.removeEntry(fileName);
      console.log('[Upload] File deleted from OPFS successfully');
    } catch (error) {
      console.error('[Upload] Failed to delete file from OPFS:', error);
      // Don't throw - cleanup is not critical
    }
  }

  async function handleUpload() {
    let fileName: string | null = null;

    try {
      console.log('[Upload] Starting upload process');

      // Get file name first for cleanup later
      fileName = await getFilePathFromIndexedDB();

      // Get recording file from OPFS
      console.log('[Upload] Retrieving recording from temporary storage');
      const blob = await getRecordingFileFromOPFS();

      if (!blob) {
        console.error('[Upload] No recording found in temporary storage');
        setUploadState({
          status: 'error',
          message: 'No recording found',
          error: 'The recording file was not found in temporary storage. Please try recording again.'
        });
        return;
      }

      console.log('[Upload] Successfully retrieved file, size:', blob.size, 'bytes');

      // Store blob reference in memory for later download
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);

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

      try {
        const s3Key = await uploadToS3ViaBackground(blob, config.encryptionKey, config.healthProfessionalId);

        console.log('[Upload] Upload successful, setting success state');

        setUploadState({
          status: 'success',
          message: 'Upload successful!',
          s3Key
        });

        // Clean up the database only (keep file for download)
        console.log('[Upload] Cleaning up database');
        await deleteFilePathFromIndexedDB();
        // Note: We keep the OPFS file so the download button works

      } catch (error) {
        console.error('[Upload] Upload failed:', error);

        setUploadState({
          status: 'error',
          message: 'Upload failed',
          error: (error as Error).message
        });
      }

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
              💾 Download Recording
            </button>
          )}
        </div>
      )}

      {uploadState.status === 'error' && (
        <div>
          <p className="error">{uploadState.message}</p>
          {uploadState.error && <p className="error">{uploadState.error}</p>}
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'center' }}>
            {blobUrl && (
              <button
                onClick={handleOpenRecording}
                style={{
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
                💾 Download Recording
              </button>
            )}
            <button
              onClick={handleRetryUpload}
              style={{
                padding: '10px 20px',
                backgroundColor: '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              🔄 Retry Upload
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

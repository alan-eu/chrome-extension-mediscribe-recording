import React, { useEffect, useState } from 'react';

export const RecordDialog: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<string>('');
  const [settingsError, setSettingsError] = useState<string>('');

  useEffect(() => {
    chrome.storage.session.get('recording', (result) => {
      setIsRecording(result.recording);
    });

    // Check microphone permission status
    checkMicrophonePermission();

    // Check if settings are configured
    checkSettings();
  }, []);

  const checkMicrophonePermission = async () => {
    try {
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      setPermissionStatus(permissionStatus.state);
    } catch (error) {
      console.log('Permission API not supported');
      setPermissionStatus('unknown');
    }
  };

  const checkSettings = async () => {
    console.log('[Popup] Checking settings configuration');

    chrome.storage.sync.get([
      'healthProfessionalId',
      'awsAccessKeyId',
      'awsSecretAccessKey',
      'awsRegion',
      's3Bucket',
      'encryptionKey'
    ], (config) => {
      const missingSettings: string[] = [];

      if (!config.healthProfessionalId) missingSettings.push('Health Professional ID');
      if (!config.awsAccessKeyId) missingSettings.push('AWS Access Key ID');
      if (!config.awsSecretAccessKey) missingSettings.push('AWS Secret Access Key');
      if (!config.awsRegion) missingSettings.push('AWS Region');
      if (!config.s3Bucket) missingSettings.push('S3 Bucket');
      if (!config.encryptionKey) missingSettings.push('Encryption Key');

      if (missingSettings.length > 0) {
        const error = `Missing settings: ${missingSettings.join(', ')}`;
        console.error('[Popup]', error);
        setSettingsError(error);
      } else {
        console.log('[Popup] All settings configured');
        setSettingsError('');
      }
    });
  };

  const handleRecordClick = async () => {
    if (isRecording) {
      console.log('[Popup] Attempting to stop recording');
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        if (currentTab.id) {
          chrome.runtime.sendMessage({
            action: 'stopRecording',
            tabId: currentTab.id,
          });
          setIsRecording(false);
        }
      });
    } else {
      // Check settings before starting recording
      if (settingsError) {
        console.error('[Popup] Cannot start recording, settings not configured');
        alert('Please configure all settings before recording.\n\n' + settingsError);
        return;
      }

      console.log('[Popup] Starting recording');
      setIsChecking(true);

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        if (currentTab.id) {
          chrome.runtime.sendMessage({
            action: 'startRecording',
            tabId: currentTab.id,
          });
          setIsRecording(true);
          setIsChecking(false);
        }
      });
    }
  };

  const getPermissionStatusText = () => {
    switch (permissionStatus) {
      case 'granted':
        return '🎤 Microphone access granted';
      case 'denied':
        return '🚫 Microphone access denied';
      case 'prompt':
        return '❓ Microphone permission required';
      default:
        return '🔍 Checking microphone access...';
    }
  };

  const handleSettingsClick = () => {
    chrome.runtime.openOptionsPage();
  };

  return (
    <div style={{ padding: '20px', minWidth: '250px' }}>
      <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Mediscribe Recorder</h3>
        <button
          onClick={handleSettingsClick}
          style={{
            padding: '5px 10px',
            backgroundColor: '#666',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
          title="Settings"
        >
          ⚙️ Settings
        </button>
      </div>

      <div style={{ marginBottom: '15px', fontSize: '12px', color: '#666' }}>
        {getPermissionStatusText()}
      </div>

      {settingsError && (
        <div style={{ marginBottom: '15px', fontSize: '12px', color: '#f44336', backgroundColor: '#ffebee', padding: '8px', borderRadius: '4px' }}>
          ⚠️ {settingsError}
        </div>
      )}

      <div>
        <button
          onClick={handleRecordClick}
          disabled={isChecking || (!isRecording && !!settingsError)}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: isRecording ? '#f44336' : (settingsError ? '#ccc' : '#4CAF50'),
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: (isChecking || (!isRecording && !!settingsError)) ? 'not-allowed' : 'pointer',
            opacity: (!isRecording && settingsError) ? 0.6 : 1
          }}
        >
          {isChecking ? 'Checking permissions...' :
           isRecording ? 'Stop Recording' : 'Start Recording'}
        </button>
      </div>

      {permissionStatus === 'denied' && (
        <div style={{ marginTop: '10px', fontSize: '12px', color: '#f44336' }}>
          Please enable microphone access in Chrome settings to record audio.
        </div>
      )}

      {settingsError && (
        <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
          Click "⚙️ Settings" to configure AWS credentials and encryption key.
        </div>
      )}
    </div>
  );
};

export default RecordDialog;

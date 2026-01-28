import React, { useEffect, useState } from 'react';

export const RecordDialog: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<string>('');

  useEffect(() => {
    chrome.storage.session.get('recording', (result) => {
      setIsRecording(result.recording);
    });
    
    // Check microphone permission status
    checkMicrophonePermission();
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

  const handleRecordClick = async () => {
    if (isRecording) {
      console.log('Attempting to stop recording');
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

      <div>
        <button
          onClick={handleRecordClick}
          disabled={isChecking}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: isRecording ? '#f44336' : '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isChecking ? 'not-allowed' : 'pointer'
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
    </div>
  );
};

export default RecordDialog;

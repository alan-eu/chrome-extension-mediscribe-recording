# Mediscribe Recorder v1.0

## 🎉 Initial Release

We're excited to announce the first release of **Mediscribe Recorder**, a Chrome extension designed for healthcare professionals to securely record and upload medical conversations.

---

## 🐛 Bug Fixes (v1.0.1)

### Audio Fix for Video Calls
- **Fixed**: Audio not heard by other participants during recording in video calls
- **Cause**: Tab audio captured via `chrome.tabCapture` was being intercepted but not played back to speakers
- **Solution**: Connected tab audio source to `audioContext.destination` to ensure captured audio continues playing while being recorded

### Extension Icon Visibility
- **Fixed**: Extension icon was hard to find in toolbar after stopping a recording
- **Cause**: The extension used a dim "not-recording.png" icon after the first recording stopped
- **Solution**: Now uses the main branded icon (`assets/icons/32.png`) when not recording, matching the default icon shown on first launch

---

## ✨ Features

### Audio Recording
- **Tab Audio Capture** - Record audio from any browser tab (meetings, video calls, etc.)
- **Microphone Recording** - Optionally capture microphone input alongside tab audio
- **Audio Mixing** - Automatically mixes tab and microphone audio into a single mono track
- **High-Quality Output** - PCM 16-bit 16kHz WAV format for clear audio

### Security & Privacy
- **AES-256-CBC Encryption** - All recordings are encrypted before upload using industry-standard encryption
- **PBKDF2 Key Derivation** - Secure key derivation with 10,000 iterations and SHA-256
- **OpenSSL Compatible** - Encrypted files can be decrypted using standard OpenSSL commands
- **Secure Credential Storage** - AWS credentials stored securely in Chrome sync storage

### Cloud Upload
- **Automatic S3 Upload** - Recordings are automatically uploaded to AWS S3 after capture
- **Progress Tracking** - Real-time upload progress indicator
- **Configurable Settings** - Customizable AWS region, bucket name, and credentials

### User Experience
- **Simple Interface** - One-click start/stop recording from the popup
- **Permission Management** - Clear microphone permission status and easy access to grant permissions
- **Local Playback** - Listen to recordings before they're uploaded
- **Health Professional ID** - Recordings are tagged with your unique identifier for easy organization

---

## 📦 What's Included

- `manifest.json` - Extension configuration (Manifest V3)
- `background.js` - Service worker for S3 uploads and extension management
- `pages/popup/` - Main extension popup interface
- `pages/settings/` - AWS credentials and configuration page
- `pages/upload/` - Upload progress and playback page
- `pages/offscreen/` - Audio recording engine
- `pages/permission/` - Microphone permission request page
- `assets/icons/` - Extension icons (16px, 24px, 32px, 64px, 128px, 256px)

---

## 🔧 Installation

1. Download `mediscribe-recorder.zip` from this release
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Drag and drop the zip file onto the page (or extract and use "Load unpacked")
5. Click the extension icon and go to Settings (⚙️) to configure your credentials

---

## ⚙️ Configuration Required

Before using the extension, configure the following in Settings:

| Setting | Description |
|---------|-------------|
| **Health Professional ID** | Your unique identifier (used in recording filenames) |
| **AWS Access Key ID** | Your AWS access key |
| **AWS Secret Access Key** | Your AWS secret key |
| **AWS Region** | AWS region (default: eu-west-3) |
| **S3 Bucket Name** | Target S3 bucket |
| **Encryption Key** | Password for AES-256-CBC encryption |

---

## 🔐 Decrypting Recordings

To decrypt downloaded recordings using OpenSSL:

```bash
openssl enc -aes-256-cbc -salt -pbkdf2 -d -k YOUR_ENCRYPTION_KEY -in recording.wav.enc -out recording.wav
```

---

## 📋 Permissions

This extension requires the following permissions:
- `activeTab` - Access to current tab for recording
- `tabCapture` - Capture tab audio
- `tabs` - Manage tabs
- `storage` - Store credentials securely
- `offscreen` - Create offscreen document for recording

---

## 🛠️ Technical Stack

- **Framework**: React 18 with TypeScript
- **Bundler**: Rollup
- **AWS SDK**: @aws-sdk/client-s3 v3
- **Chrome Extension**: Manifest V3

---

## 📝 Notes

- Recordings are stored at: `s3://[bucket]/chrome-extension-audio-recordings/[health-professional-id]-[timestamp].wav.enc`
- The extension properly cleans up media streams between recordings
- IndexedDB is used for temporary blob storage during the upload process

---

## 🐛 Known Issues

- If you see "Cannot capture a tab with an active stream", refresh the page and try again

---

**Full Changelog**: Initial release

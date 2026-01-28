# Mediscribe Recorder Browser Extension

## Description
This browser extension records audio from browser tabs (and optionally microphone) and uploads the recordings to AWS S3. The extension captures tab audio, mixes it with microphone input if available, and automatically uploads the recording to a configured S3 bucket.

## Prerequisites

- Node v20+
- yarn v1.x
- AWS S3 bucket with appropriate permissions
- AWS credentials (Access Key ID and Secret Access Key)

## Installation for Development

1. Install dependencies and run the project
```bash
yarn install
yarn dev
```

2. Load the extension in Chrome
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the `dist` folder

3. Configure AWS credentials
   - Click the extension icon → "⚙️ Settings"
   - Enter your AWS credentials:
     - **AWS Access Key ID**
     - **AWS Secret Access Key**
     - **AWS Region** (default: eu-west-3)
     - **S3 Bucket Name** (default: occupational-health-medical-conversation-recordings)
   - **Note:** AWS credentials can be found in [AWS Secret Manager](https://eu-central-1.console.aws.amazon.com/secretsmanager/secret?name=medical-conversation-recordings-uploader-creds&region=eu-central-1)

## Usage

1. Navigate to any web page with audio (e.g., YouTube, meeting platform)
2. Click the extension icon
3. Click "Start Recording"
4. Play audio on the tab (and speak into microphone if you want to record both)
5. Click "Stop Recording" when done
6. The upload page opens showing upload progress
7. Click "🎵 Open Recording" to listen to the recording
8. The recording is automatically uploaded to S3 at: `s3://[your-bucket]/chrome-extension-audio-recordings/meeting-[timestamp].webm`

## Package for Distribution

To create a distributable package for testing:

```bash
yarn build
cd dist && zip -r ../mediscribe-recorder.zip . && cd ..
```

Share `mediscribe-recorder.zip` with testers who can:
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Drag and drop the zip file onto the page (or extract and use "Load unpacked")

## Project Structure

- `src/pages/offscreen/` (React)
    - Main logic to record audio from a tab and microphone
    - Handles MediaRecorder, AudioContext, and stream mixing
    - Saves recordings to IndexedDB
- `src/pages/popup/` (React)
    - Browser popup with "Start Recording" / "Stop Recording" buttons
    - Shows microphone permission status
    - Settings button to configure AWS credentials
- `src/pages/upload/` (React)
    - Upload page that handles S3 upload via background script
    - Shows upload progress and success/error states
    - Button to open the recorded audio file
- `src/pages/settings/` (React)
    - Settings page for configuring AWS S3 credentials
    - Stores credentials in `chrome.storage.sync`
- `src/pages/permission/` (React)
    - Permission request page for microphone access
- `src/background.ts`
    - Background service worker
    - Handles S3 uploads using AWS SDK
    - Manages offscreen document lifecycle
    - Checks microphone permissions
- `src/scripts/content-script.ts`
    - Content script (currently minimal usage)

## Features

- ✅ Records audio from browser tabs
- ✅ Records microphone input and mixes with tab audio
- ✅ Automatically uploads recordings to AWS S3
- ✅ Shows upload progress with success/error handling
- ✅ Manual button to play the recording
- ✅ Proper cleanup of media streams (supports multiple recordings)
- ✅ Configurable AWS S3 settings via extension options
- ✅ Microphone permission handling
- ✅ Single audio file with combined tab + microphone audio

## Technical Details

### Recording Process
1. Extension creates an offscreen document to access `getUserMedia` API
2. Captures tab audio using `chrome.tabCapture` API
3. Optionally captures microphone audio
4. Uses Web Audio API (`AudioContext`) to mix both streams
5. Records the mixed stream using `MediaRecorder` API (WebM format)
6. Stores the blob in IndexedDB temporarily

### Upload Process
1. Upload page retrieves blob from IndexedDB
2. Sends blob data to background script via message passing
3. Background script uses AWS SDK to upload to S3
4. File is stored at: `chrome-extension-audio-recordings/meeting-[timestamp].webm`

### Permissions Required
- `activeTab` - Access to current tab
- `tabCapture` - Capture tab audio
- `tabs` - Manage tabs
- `storage` - Store AWS credentials
- `offscreen` - Create offscreen document for recording

## Troubleshooting

### "Cannot capture a tab with an active stream"
- This happens if a previous recording wasn't properly stopped
- Refresh the page and try again
- The extension now properly cleans up streams to prevent this

### "AWS credentials not configured"
- Go to Settings (⚙️ button in popup)
- Enter your AWS credentials
- Credentials are stored securely in Chrome sync storage

### Microphone not recording
- Check Chrome microphone permissions for the extension
- Click extension icon to see permission status
- If denied, go to Chrome settings to enable microphone access

## Development Notes

- Built with Rollup for bundling
- Uses TypeScript and React
- AWS SDK dynamically imported in background script only
- IndexedDB used for temporary blob storage between offscreen and upload pages
- Removed React StrictMode in upload page to prevent double uploads

## License

MIT

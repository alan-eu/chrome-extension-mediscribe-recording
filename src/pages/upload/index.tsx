import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

console.log('[Upload Page] Initializing React app');

const container = document.getElementById('root');
if (!container) {
  console.error('[Upload Page] Root container not found');
} else {
  console.log('[Upload Page] Root container found, creating React root');
  const root = createRoot(container);

  root.render(
    <App />
  );

  console.log('[Upload Page] React app rendered');
}

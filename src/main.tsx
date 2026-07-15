import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { setupFirebaseSync } from './lib/firebaseSync';

// Initialize real-time Firebase syncing with local storage
setupFirebaseSync();

// Capture PWA install prompt globally so it's never missed
let deferredPrompt: any = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  console.log('[PWA] Global beforeinstallprompt captured.');
  // Dispatch a custom event to notify React components that the prompt is available
  window.dispatchEvent(new CustomEvent('pwa-prompt-available'));
});

(window as any).getDeferredPrompt = () => deferredPrompt;
(window as any).clearDeferredPrompt = () => { deferredPrompt = null; };

// Register Progressive Web App (PWA) Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((reg) => console.log('Service Worker registered successfully!', reg.scope))
      .catch((err) => console.warn('Service Worker registration failed:', err));
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

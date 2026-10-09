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

// Clear any stale caches on app start so updates show immediately
if ('caches' in window) {
  caches.keys().then((names) => {
    names.forEach((name) => {
      if (name.includes('v1')) {
        caches.delete(name);
      }
    });
  });
}

// Register Progressive Web App (PWA) & FCM Service Worker with graceful fallback
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
      .then((reg) => {
        console.log('[PWA/FCM] Service Worker registered with scope:', reg.scope);
      })
      .catch((err) => {
        console.log('[PWA/FCM] Service worker registration note:', err?.message || err);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

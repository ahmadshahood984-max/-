import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { setupFirebaseSync, startDeferredFirebaseSync } from './lib/firebaseSync';

// Install synchronous lightweight localStorage sync hook immediately (<0.1ms),
// deferring IndexedDB & Firestore real-time listeners until right after first paint.
setupFirebaseSync({ deferNetwork: true });

// Capture PWA install prompt globally so it's never missed
let deferredPrompt: any = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  window.dispatchEvent(new CustomEvent('pwa-prompt-available'));
});

(window as any).getDeferredPrompt = () => deferredPrompt;
(window as any).clearDeferredPrompt = () => { deferredPrompt = null; };

// Render UI immediately without double-mounting real-time Firestore listeners
createRoot(document.getElementById('root')!).render(<App />);

// Start background IndexedDB vault hydration, Firestore listeners, stale cache cleanup & SW after first paint
const scheduleAfterFirstPaint = () => {
  startDeferredFirebaseSync();

  if ('caches' in window) {
    caches.keys().then((names) => {
      names.forEach((name) => {
        if (name.includes('v1')) {
          caches.delete(name);
        }
      });
    }).catch(() => {});
  }
};

if (typeof requestAnimationFrame === 'function') {
  requestAnimationFrame(() => setTimeout(scheduleAfterFirstPaint, 0));
} else {
  setTimeout(scheduleAfterFirstPaint, 0);
}

// Register Progressive Web App (PWA) & FCM Service Worker with graceful fallback
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
      .catch((err) => {
        console.log('[PWA/FCM] Service worker registration note:', err?.message || err);
      });
  });
}

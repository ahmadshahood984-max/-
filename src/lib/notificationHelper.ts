/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Safely triggers a system/browser notification across desktop, mobile (Android Chrome), and PWA.
 * On Android Chrome and certain mobile browsers, `new Notification(...)` throws:
 * "TypeError: Failed to construct 'Notification': Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead."
 * This helper tries Service Worker showNotification first, then Notification constructor inside try-catch.
 */
export const safeShowNotification = async (
  title: string,
  options?: NotificationOptions
): Promise<boolean> => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  try {
    if (Notification.permission !== 'granted') {
      return false;
    }

    // 1. Try ServiceWorkerRegistration.showNotification (recommended on mobile/Android Chrome)
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration && typeof registration.showNotification === 'function') {
          await registration.showNotification(title, options);
          return true;
        }
      } catch (swErr) {
        // Fallback to constructor
      }
    }

    // 2. Try window.Notification constructor (supported on Desktop Chrome, Firefox, Safari)
    try {
      new Notification(title, options);
      return true;
    } catch (notifErr) {
      // Caught on Android Chrome where Notification constructor is illegal
      console.warn('[NotificationHelper] Notification constructor not permitted on this device/browser:', notifErr);
      return false;
    }
  } catch (err) {
    console.warn('[NotificationHelper] Unexpected error showing notification:', err);
    return false;
  }
};

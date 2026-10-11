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
    const iconUrl = typeof window !== 'undefined' ? `${window.location.origin}/icon.png` : '/icon.png';
    const badgeUrl = typeof window !== 'undefined' ? `${window.location.origin}/badge.png` : '/badge.png';

    const mergedOptions: any = {
      badge: badgeUrl,
      icon: iconUrl,
      dir: 'rtl',
      lang: 'ar',
      renotify: true,
      requireInteraction: false,
      vibrate: [300, 150, 300, 150, 400],
      ...options
    };
    if (!mergedOptions.icon) mergedOptions.icon = iconUrl;
    if (!mergedOptions.badge) mergedOptions.badge = badgeUrl;

    if ('serviceWorker' in navigator) {
      try {
        const registration = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.ready);
        if (registration && typeof registration.showNotification === 'function') {
          await registration.showNotification(title, mergedOptions);
          return true;
        }
      } catch (swErr) {
        // Fallback to constructor
      }
    }

    // 2. Try window.Notification constructor (supported on Desktop Chrome, Firefox, Safari)
    try {
      new Notification(title, mergedOptions);
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

/**
 * Dismisses/closes an active system/push notification by its message ID or tag.
 * Automatically closes both ServiceWorker active notifications and matching tags.
 */
export const dismissNotification = async (tagOrId: string): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  const targetTags = [
    tagOrId,
    `notif_${tagOrId}`,
    `msg-${tagOrId}`,
    `notif_msg-${tagOrId}`
  ];

  try {
    if ('serviceWorker' in navigator) {
      const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.ready);
      if (reg && typeof reg.getNotifications === 'function') {
        const notifications = await reg.getNotifications();
        for (const notif of notifications) {
          const matchTag = targetTags.includes(notif.tag);
          const matchData = notif.data && (
            notif.data.msgId === tagOrId ||
            targetTags.includes(notif.data.tag) ||
            notif.data.url?.includes(tagOrId)
          );

          if (matchTag || matchData) {
            notif.close();
            console.log(`[NotificationHelper] Dismissed notification: ${notif.tag}`);
          }
        }
      }
    }
    return true;
  } catch (err) {
    console.warn('[NotificationHelper] Error dismissing notification:', err);
    return false;
  }
};

/**
 * Dismisses all active notifications shown by this application.
 */
export const dismissAllNotifications = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  try {
    if ('serviceWorker' in navigator) {
      const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.ready);
      if (reg && typeof reg.getNotifications === 'function') {
        const notifications = await reg.getNotifications();
        for (const notif of notifications) {
          notif.close();
        }
        console.log(`[NotificationHelper] Dismissed all ${notifications.length} notifications.`);
      }
    }
    return true;
  } catch (err) {
    console.warn('[NotificationHelper] Error dismissing all notifications:', err);
    return false;
  }
};

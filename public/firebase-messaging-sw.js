/**
 * Firebase Cloud Messaging & PWA Unified Service Worker
 * Handles external background push notifications when app/browser is closed
 * 100% Free - Works on Android, iOS (PWA 16.4+), and Desktop browsers.
 */

// Import Firebase App and Messaging Compat SDKs
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

const CACHE_NAME = 'school-pwa-v3';

// 1. Initialize Firebase App in the Service Worker
try {
  firebase.initializeApp({
    apiKey: "AIzaSyDcSshIC_Rs7m8uOF9OkHIJQ--JTifVKUQ",
    authDomain: "aesthetic-night-p8gvj.firebaseapp.com",
    projectId: "aesthetic-night-p8gvj",
    storageBucket: "aesthetic-night-p8gvj.firebasestorage.app",
    messagingSenderId: "600017099331",
    appId: "1:600017099331:web:23e214f289dbe0ecdc92f6"
  });

  const messaging = firebase.messaging();

  // Handle FCM background messages
  messaging.onBackgroundMessage((payload) => {
    console.log('[FCM SW] Background message payload:', payload);

    const title = payload.notification?.title || payload.data?.title || 'إشعار من المدرسة الدولية 🔔';
    const body = payload.notification?.body || payload.data?.body || 'لديك رسالة أو تحديث جديد من المنصة المدرسية.';

    const iconUrl = self.location.origin + '/icon.png';
    const badgeUrl = self.location.origin + '/badge.png';

    const options = {
      body: body,
      icon: iconUrl,
      badge: badgeUrl,
      vibrate: [300, 150, 300, 150, 400],
      dir: 'rtl',
      lang: 'ar',
      data: {
        url: payload.data?.click_action || payload.fcmOptions?.link || '/'
      }
    };

    self.registration.showNotification(title, options);
  });
} catch (err) {
  console.warn('[FCM SW] Firebase init note:', err);
}

// 2. Standard Web Push Notification event handler (works across all browsers)
self.addEventListener('push', function(event) {
  console.log('[SW Push] Push event received:', event);

  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'إشعار من المدرسة الدولية 🔔', body: event.data.text() };
    }
  }

  const notificationTitle = data.notification?.title || data.title || 'إشعار من المدرسة الدولية 🔔';
  const iconUrl = self.location.origin + '/icon.png';
  const badgeUrl = self.location.origin + '/badge.png';

  const notificationOptions = {
    body: data.notification?.body || data.body || 'لديك إشعار جديد بخصوص درجات وملاحظات الطالب.',
    icon: iconUrl,
    badge: badgeUrl,
    vibrate: [300, 150, 300, 150, 400],
    dir: 'rtl',
    lang: 'ar',
    tag: data.tag || 'school-alert',
    renotify: true,
    data: {
      url: data.data?.url || data.url || '/'
    }
  };

  event.waitUntil(self.registration.showNotification(notificationTitle, notificationOptions));
});

// 3. Handle messages dispatched directly to Service Worker
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'DISPATCH_PUSH_NOTIFICATION') {
    const title = event.data.title || 'إشعار من المدرسة الدولية 🔔';
    const body = event.data.body || 'لديك تحديث جديد في المنصة المدرسية.';
    const msgId = event.data.payload?.msgId || event.data.msgId || Date.now();
    const iconUrl = self.location.origin + '/icon.png';
    const badgeUrl = self.location.origin + '/badge.png';

    const options = {
      body: body,
      icon: iconUrl,
      badge: badgeUrl,
      vibrate: [300, 150, 300, 150, 400],
      dir: 'rtl',
      lang: 'ar',
      tag: `notif_${msgId}`,
      renotify: true,
      data: {
        msgId: msgId,
        url: `/?portal=parent&tab=messages&msgId=${msgId}`
      }
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } else if (event.data && event.data.type === 'DISMISS_NOTIFICATION') {
    const tag = event.data.tag;
    const msgId = event.data.msgId;
    self.registration.getNotifications().then(notifications => {
      notifications.forEach(n => {
        if (
          n.tag === tag || 
          n.tag === `notif_${msgId}` || 
          n.tag === `msg-${msgId}` || 
          (n.data && n.data.msgId === msgId)
        ) {
          n.close();
        }
      });
    });
  } else if (event.data && event.data.type === 'DISMISS_ALL_NOTIFICATIONS') {
    self.registration.getNotifications().then(notifications => {
      notifications.forEach(n => n.close());
    });
  }
});

// 4. Handle clicking on notifications
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const msgId = event.notification.data?.msgId || event.notification.tag?.replace(/^(notif_|msg-)/, '');
  const targetUrl = event.notification.data?.url || (msgId ? `/?portal=parent&tab=messages&msgId=${msgId}` : '/?portal=parent&tab=messages');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if (msgId) {
            client.postMessage({ type: 'OPEN_MESSAGE', msgId: msgId, tab: 'messages' });
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// 4. PWA Cache Management & Offline Support
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || e.request.url.includes('firestore.googleapis.com') || e.request.url.includes('/api/')) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && e.request.url.startsWith(self.location.origin)) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseToCache));
        }
        return networkResponse;
      })
      .catch(() => caches.match(e.request))
  );
});

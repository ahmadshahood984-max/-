/**
 * Firebase Cloud Messaging Service Worker
 */

// Import Firebase App and Messaging Compat SDKs
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Initialize Firebase App in the Service Worker
firebase.initializeApp({
  apiKey: "AIzaSyDcSshIC_Rs7m8uOF9OkHIJQ--JTifVKUQ",
  authDomain: "aesthetic-night-p8gvj.firebaseapp.com",
  projectId: "aesthetic-night-p8gvj",
  storageBucket: "aesthetic-night-p8gvj.firebasestorage.app",
  messagingSenderId: "600017099331",
  appId: "1:600017099331:web:23e214f289dbe0ecdc92f6"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background message received:', payload);
  
  const notificationTitle = payload.notification?.title || 'إشعار مدرسي جديد 🔔';
  const notificationOptions = {
    body: payload.notification?.body || 'لديك رسالة أو تحديث جديد من إدارة المدرسة.',
    icon: '/icon.png',
    badge: '/icon.png',
    vibrate: [200, 100, 200],
    data: {
      click_action: '/'
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Standard push notification event listener fallback
self.addEventListener('push', function(event) {
  console.log('[Service Worker] Push event received:', event);
  
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'إشعار جديد 🔔', body: event.data.text() };
    }
  }

  const title = data.title || 'إشعار مدرسي جديد 🔔';
  const options = {
    body: data.body || 'لديك تحديث جديد في المنصة المدرسية.',
    icon: '/icon.png',
    badge: '/icon.png',
    vibrate: [200, 100, 200],
    data: {
      click_action: '/'
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle clicking on notifications
self.addEventListener('notificationclick', function(event) {
  console.log('[Service Worker] Notification click received.');
  
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

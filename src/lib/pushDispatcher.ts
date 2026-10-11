/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from './firebase';
import { collection, addDoc, doc, getDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { trackFirestoreRead, trackFirestoreWrite } from './firestoreTracker';
import { safeShowNotification } from './notificationHelper';

export interface PushNotificationPayload {
  title: string;
  body: string;
  fullContent?: string;
  senderName?: string;
  senderRole?: 'teacher' | 'director' | 'system' | 'admin';
  senderId?: string;
  msgId?: string;
  studentId?: string;
  studentName?: string;
  category?: 'grades' | 'notes' | 'attendance' | 'announcement' | 'direct' | 'general' | 'behavior' | 'finance';
  url?: string;
}

/**
 * Dispatches a push notification to a parent's registered device via FCM & Firestore
 * 100% Free - operates under standard Spark (Free) plan without requiring Cloud Functions or Blaze plan.
 */
export async function sendParentPushNotification(
  parentId: string,
  payload: PushNotificationPayload
): Promise<boolean> {
  if (!parentId) return false;

  const title = payload.title || 'إشعار من المدرسة الدولية 🔔';
  const body = payload.body || 'لديك تحديث جديد في المنصة المدرسية.';
  const msgId = payload.msgId || `m_push_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  let success = false;

  // 1. Add record to Firestore 'notifications' collection so all listening parent devices receive it in real-time
  try {
    if (db) {
      await addDoc(collection(db, 'notifications'), {
        id: msgId,
        receiverId: parentId,
        receiverRole: 'parent',
        title: title,
        content: payload.fullContent || body,
        body: body,
        senderId: payload.senderId || 'school',
        senderName: payload.senderName || 'المدرسة الدولية الخاصة 🏫',
        senderRole: payload.senderRole || 'teacher',
        studentId: payload.studentId || null,
        studentName: payload.studentName || null,
        category: payload.category || 'grades',
        timestamp: serverTimestamp(),
        date: new Date().toISOString(),
        read: false,
        status: 'unread'
      });
      trackFirestoreWrite(1);
      success = true;
      console.log(`[PushDispatcher] Saved notification to Firestore for parent: ${parentId} (ID: ${msgId})`);
    }
  } catch (err) {
    console.warn('[PushDispatcher] Could not record notification to Firestore:', err);
  }

  // 2. Dispatch to Service Worker channel if active on this device
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'DISPATCH_PUSH_NOTIFICATION',
        title,
        body,
        parentId,
        msgId,
        payload: { ...payload, msgId }
      });
    }
  } catch (swErr) {
    // Ignore SW postMessage errors
  }

  // 3. Look up parent's registered FCM/Web Push device token
  try {
    if (db) {
      const tokenDocRef = doc(db, 'fcm_tokens', parentId);
      const tokenDoc = await getDoc(tokenDocRef);
      trackFirestoreRead(1);

      if (tokenDoc.exists()) {
        const tokenData = tokenDoc.data();
        const fcmToken = tokenData?.token;

        if (fcmToken) {
          console.log(`[PushDispatcher] Found active FCM device token for parent ${parentId}. Device: ${tokenData?.deviceInfo || 'Unknown'}`);

          // Read custom VAPID/Server config if configured in school settings (localStorage or Firestore)
          let serverKey = '';
          const savedFcmConfig = localStorage.getItem('school_fcm_config');
          if (savedFcmConfig) {
            try {
              const parsed = JSON.parse(savedFcmConfig);
              if (parsed?.serverKey) serverKey = parsed.serverKey;
            } catch {
              // ignore
            }
          }

          if (!serverKey && db) {
            try {
              const configDoc = await getDoc(doc(db, 'school_live_data', 'school_fcm_config'));
              if (configDoc.exists()) {
                const cfg = configDoc.data()?.data;
                if (typeof cfg === 'string') {
                  const parsed = JSON.parse(cfg);
                  if (parsed?.serverKey) serverKey = parsed.serverKey;
                } else if (cfg?.serverKey) {
                  serverKey = cfg.serverKey;
                }
              }
            } catch {
              // ignore
            }
          }

          if (serverKey) {
            try {
              await fetch('https://fcm.googleapis.com/fcm/send', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `key=${serverKey}`
                },
                body: JSON.stringify({
                  to: fcmToken,
                  notification: {
                    title: title,
                    body: body,
                    icon: '/icon.png',
                    click_action: '/'
                  },
                  data: {
                    title: title,
                    body: body,
                    parentId: parentId,
                    studentId: payload.studentId || '',
                    category: payload.category || 'grades'
                  }
                })
              });
              console.log(`[PushDispatcher] FCM push request dispatched.`);
            } catch (fcmErr) {
              console.warn('[PushDispatcher] FCM REST dispatch note:', fcmErr);
            }
          }
        }
      }
    }
  } catch (tokenErr) {
    console.warn('[PushDispatcher] Error querying FCM device token:', tokenErr);
  }

  // 4. Fallback: If on this active browser Notification permission is granted and active parent matches, trigger system notification immediately
  try {
    const activeParentId = localStorage.getItem('school_active_parent_id') || '';
    if (activeParentId === parentId || !activeParentId) {
      safeShowNotification(title, {
        body: body,
        icon: '/icon.png',
        tag: `notif_${msgId}`,
        data: {
          msgId,
          url: `/?portal=parent&tab=messages&msgId=${msgId}`
        }
      });
    }
  } catch {
    // ignore
  }

  return success;
}

/**
 * Dispatches a push notification to multiple parents (e.g. for cohort or class announcements)
 */
export async function sendBroadcastPushNotification(
  parentIds: string[],
  payload: PushNotificationPayload
): Promise<{ total: number; sent: number }> {
  if (!parentIds || parentIds.length === 0) {
    return { total: 0, sent: 0 };
  }

  const uniqueParentIds = Array.from(new Set(parentIds.filter(Boolean)));
  let sentCount = 0;

  for (const pId of uniqueParentIds) {
    try {
      const res = await sendParentPushNotification(pId, payload);
      if (res) sentCount++;
    } catch (e) {
      console.warn(`[PushDispatcher] Failed to send to parent ${pId}:`, e);
    }
  }

  return { total: uniqueParentIds.length, sent: sentCount };
}

/**
 * Gets count of registered push notification devices from Firestore
 */
export async function getRegisteredPushDevicesCount(): Promise<number> {
  try {
    if (!db) return 0;
    const snap = await getDocs(collection(db, 'fcm_tokens'));
    trackFirestoreRead(snap.size || 1);
    return snap.size;
  } catch (err) {
    console.warn('[PushDispatcher] Could not fetch FCM tokens count:', err);
    return 0;
  }
}


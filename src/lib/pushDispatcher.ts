/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db, writeFirestoreDocFast } from './firebase';
import { collection, doc, getDoc, getCountFromServer } from 'firebase/firestore';
import { trackFirestoreRead, trackFirestoreWrite } from './firestoreTracker';
import { safeShowNotification } from './notificationHelper';
import {
  isFirestoreWriteQuotaExceeded,
  isFirestoreReadQuotaExceeded,
  markFirestoreWriteQuotaExceeded,
  markFirestoreReadQuotaExceeded,
  isQuotaError
} from './quotaManager';
import { isReadCacheFresh, markReadCacheFresh } from './readCache';

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
  tag?: string;
  skipFirestoreRecord?: boolean;
  targetReceiverId?: string;
}

/**
 * Dispatches a push notification to a parent's registered device via FCM & Firestore
 * Strictly sends at most ONE notification and ensures deterministic document identification.
 */
let cachedFcmServerKey: string | null = null;
let cachedFcmServerKeyFetchedAt = 0;

async function getCachedFcmServerKey(): Promise<string> {
  try {
    const savedFcmConfig = localStorage.getItem('school_fcm_config');
    if (savedFcmConfig) {
      const parsed = JSON.parse(savedFcmConfig);
      if (parsed?.serverKey) {
        cachedFcmServerKey = parsed.serverKey;
        return parsed.serverKey;
      }
    }
  } catch {
    // ignore
  }

  const now = Date.now();
  if (cachedFcmServerKey !== null && now - cachedFcmServerKeyFetchedAt < 5 * 60 * 1000) {
    return cachedFcmServerKey;
  }

  if (db && !isFirestoreReadQuotaExceeded()) {
    try {
      const configDoc = await getDoc(doc(db, 'school_live_data', 'school_fcm_config'));
      if (!configDoc.metadata?.fromCache) {
        trackFirestoreRead(1, 'قراءة إعدادات FCM');
      }
      cachedFcmServerKeyFetchedAt = now;
      if (configDoc.exists()) {
        const cfg = configDoc.data()?.data;
        if (typeof cfg === 'string') {
          const parsed = JSON.parse(cfg);
          if (parsed?.serverKey) {
            cachedFcmServerKey = parsed.serverKey;
            return parsed.serverKey;
          }
        } else if (cfg?.serverKey) {
          cachedFcmServerKey = cfg.serverKey;
          return cfg.serverKey;
        }
      }
      cachedFcmServerKey = '';
    } catch (cfgErr: any) {
      if (isQuotaError(cfgErr)) markFirestoreReadQuotaExceeded(cfgErr);
    }
  }
  return cachedFcmServerKey || '';
}

export async function sendParentPushNotification(
  parentId: string,
  payload: PushNotificationPayload
): Promise<boolean> {
  if (!parentId) return false;

  const title = payload.title || 'إشعار من المدرسة الدولية 🔔';
  const body = payload.body || 'لديك تحديث جديد في المنصة المدرسية.';
  const msgId = payload.msgId || `m_push_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  let success = false;

  // 1. Add/set record to Firestore 'notifications' collection using msgId as the document ID
  if (!payload.skipFirestoreRecord && !isFirestoreWriteQuotaExceeded()) {
    try {
      if (db && !isFirestoreWriteQuotaExceeded()) {
        await writeFirestoreDocFast('notifications', msgId, {
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
          updatedAt: Date.now(),
          date: new Date().toISOString(),
          read: false,
          status: 'unread'
        }, { merge: false, sdkGraceMs: 1200, restTimeoutMs: 6000 });
        trackFirestoreWrite(1, `حفظ إشعار (${parentId})`);
        success = true;
      }
    } catch (err: any) {
      if (isQuotaError(err)) {
        markFirestoreWriteQuotaExceeded(err);
      } else {
        console.warn('[PushDispatcher] Could not record notification to Firestore:', err);
      }
    }
  } else {
    success = true;
  }

  // 2. Look up parent's registered FCM/Web Push device token for external background push
  if (!isFirestoreReadQuotaExceeded()) {
    try {
      if (db && !isFirestoreReadQuotaExceeded()) {
        const tokenDocRef = doc(db, 'fcm_tokens', parentId);
        const tokenDoc = await getDoc(tokenDocRef);
        if (!tokenDoc.metadata?.fromCache) {
          trackFirestoreRead(1, `قراءة توكن إشعارات (${parentId})`);
        }

        if (tokenDoc.exists()) {
          const tokenData = tokenDoc.data();
          const fcmToken = tokenData?.token;

          if (fcmToken) {
            const serverKey = await getCachedFcmServerKey();
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
  }

  // 3. Fallback: ONLY trigger immediate system notification if the current active browser tab is actively logged in AS THIS SPECIFIC PARENT.
  try {
    if (typeof window !== 'undefined') {
      const activeParentId = localStorage.getItem('parent_portal_student_id') || localStorage.getItem('school_active_parent_id') || '';
      const isParentPortalActive = window.location.search.includes('portal=parent') || localStorage.getItem('school_active_portal') === 'parent';

      if (isParentPortalActive && activeParentId && activeParentId === parentId) {
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
    }
  } catch {
    // ignore
  }

  return success;
}

/**
 * Dispatches a push notification to multiple parents in concurrent batches
 * and saves exactly ONE broadcast record to Firestore.
 */
export async function sendBroadcastPushNotification(
  parentIds: string[],
  payload: PushNotificationPayload
): Promise<{ total: number; sent: number }> {
  if (!parentIds || parentIds.length === 0) {
    return { total: 0, sent: 0 };
  }

  const uniqueParentIds = Array.from(new Set(parentIds.filter(Boolean)));
  const title = payload.title || '📢 تعميم مدرسي رسمي';
  const body = payload.body || 'لديك تعميم جديد من إدارة المدرسة.';
  const msgId = payload.msgId || `m_broadcast_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  // 1. Create exactly ONE broadcast document in Firestore
  if (!payload.skipFirestoreRecord && db && !isFirestoreWriteQuotaExceeded()) {
    try {
      const broadcastReceiverId = payload.targetReceiverId || 'all_cohort_parents';
      await writeFirestoreDocFast('notifications', msgId, {
        id: msgId,
        receiverId: broadcastReceiverId,
        receiverRole: 'parent',
        title: title,
        content: payload.fullContent || body,
        body: body,
        senderId: payload.senderId || 'director',
        senderName: payload.senderName || 'إدارة المدرسة (المدير)',
        senderRole: 'director',
        category: 'announcement',
        updatedAt: Date.now(),
        date: new Date().toISOString(),
        read: false,
        status: 'unread'
      }, { merge: false, sdkGraceMs: 1200, restTimeoutMs: 6000 });
      trackFirestoreWrite(1, 'إرسال تعميم جماعي');
    } catch (err: any) {
      if (isQuotaError(err)) {
        markFirestoreWriteQuotaExceeded(err);
      } else {
        console.warn('[PushDispatcher] Could not record broadcast to Firestore:', err);
      }
    }
  }

  // 2. Skip scanning 180+ parent FCM docs if 0 devices registered FCM tokens
  const deviceCount = await getRegisteredPushDevicesCount().catch(() => 0);
  if (deviceCount === 0) {
    return { total: uniqueParentIds.length, sent: 0 };
  }

  // Warm server key cache once then dispatch FCM pushes concurrently in chunks of 15
  await getCachedFcmServerKey().catch(() => '');
  let sentCount = 0;
  const CHUNK_SIZE = 15;
  for (let i = 0; i < uniqueParentIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueParentIds.slice(i, i + CHUNK_SIZE);
    const results = await Promise.allSettled(
      chunk.map((pId) =>
        sendParentPushNotification(pId, {
          ...payload,
          msgId: `${msgId}_${pId}`,
          skipFirestoreRecord: true
        })
      )
    );
    results.forEach((res) => {
      if (res.status === 'fulfilled' && res.value) sentCount++;
    });
  }

  return { total: uniqueParentIds.length, sent: sentCount };
}

let cachedPushDevicesCount = 0;

/**
 * Gets count of registered push notification devices from Firestore using
 * getCountFromServer with a 5-minute TTL cache (instead of scanning all token docs).
 */
export async function getRegisteredPushDevicesCount(force: boolean = false): Promise<number> {
  const cacheKey = 'fcm_tokens:count';
  if (!force && isReadCacheFresh(cacheKey)) {
    return cachedPushDevicesCount;
  }
  if (!db || isFirestoreReadQuotaExceeded()) return cachedPushDevicesCount;
  try {
    const aggSnap = await getCountFromServer(collection(db, 'fcm_tokens'));
    const count = aggSnap.data()?.count || 0;
    cachedPushDevicesCount = count;
    markReadCacheFresh(cacheKey);
    trackFirestoreRead(1, `عد الأجهزة المسجلة (${count})`);
    return count;
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreReadQuotaExceeded(err);
    } else {
      console.warn('[PushDispatcher] Could not fetch FCM tokens count:', err);
    }
    return cachedPushDevicesCount;
  }
}


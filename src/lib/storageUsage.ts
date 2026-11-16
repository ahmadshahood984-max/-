/**
 * Firestore & Local Storage Capacity Calculator
 * Computes used vs. remaining free Spark plan storage (1 GiB = 1,024 MiB)
 * without incurring unnecessary Firestore reads, plus an optional on-demand cloud count audit.
 */

import { db } from './firebase';
import { collection, getCountFromServer } from 'firebase/firestore';
import { SYNC_KEYS } from './firebaseSync';
import { trackFirestoreRead } from './firestoreTracker';
import { isFirestoreQuotaExceeded, isQuotaError, markFirestoreQuotaExceeded } from './quotaManager';

export const FIRESTORE_SPARK_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024; // 1 GiB (1,024 MB)
export const BROWSER_LOCAL_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024; // ~5 MB standard browser quota

export interface StorageCategoryBreakdown {
  id: string;
  label: string;
  bytes: number;
  formattedSize: string;
  percentageOfUsed: number;
  keysCount: number;
}

export interface CloudCollectionCounts {
  schoolLiveData: number;
  consolidatedGrades: number;
  legacyGrades: number;
  notifications: number;
  fcmTokens: number;
  systemStats: number;
  measuredAt: number;
}

export interface StorageUsageReport {
  estimatedFirestoreBytes: number;
  estimatedFirestoreFormatted: string;
  remainingFreeBytes: number;
  remainingFreeFormatted: string;
  limitBytes: number;
  limitFormatted: string;
  percentUsed: number;
  localStorageUsedBytes: number;
  localStorageFormatted: string;
  localStoragePercent: number;
  breakdown: StorageCategoryBreakdown[];
  cloudCounts?: CloudCollectionCounts | null;
}

const CATEGORY_MAP: Record<string, { id: string; label: string }> = {
  school_grades: { id: 'grades', label: 'الدرجات والتقييمات وكشوف العلامات' },
  school_monthly_evaluations: { id: 'grades', label: 'الدرجات والتقييمات وكشوف العلامات' },
  school_sent_grade_sheets: { id: 'grades', label: 'الدرجات والتقييمات وكشوف العلامات' },
  school_blocked_grades: { id: 'grades', label: 'الدرجات والتقييمات وكشوف العلامات' },
  school_saved_evaluation_months: { id: 'grades', label: 'الدرجات والتقييمات وكشوف العلامات' },
  school_evaluation_current_month: { id: 'grades', label: 'الدرجات والتقييمات وكشوف العلامات' },

  school_messages: { id: 'messages', label: 'المراسلات والتعاميم والأعذار' },
  school_announcements: { id: 'messages', label: 'المراسلات والتعاميم والأعذار' },
  school_excuses: { id: 'messages', label: 'المراسلات والتعاميم والأعذار' },

  school_students: { id: 'directory', label: 'سجلات الطلاب والمعلمين والأهالي والصفوف' },
  school_teachers: { id: 'directory', label: 'سجلات الطلاب والمعلمين والأهالي والصفوف' },
  school_parents: { id: 'directory', label: 'سجلات الطلاب والمعلمين والأهالي والصفوف' },
  school_classes: { id: 'directory', label: 'سجلات الطلاب والمعلمين والأهالي والصفوف' },
  school_custom_subjects: { id: 'directory', label: 'سجلات الطلاب والمعلمين والأهالي والصفوف' },

  school_attendance: { id: 'attendance', label: 'سجلات الحضور اليومي والأقساط' },
  school_tuitions: { id: 'attendance', label: 'سجلات الحضور اليومي والأقساط' },

  school_app_icon: { id: 'assets', label: 'الشعارات والأختام والإعدادات والأرشيف' },
  school_seal_and_signatures_config: { id: 'assets', label: 'الشعارات والأختام والإعدادات والأرشيف' },
  school_welcome_messages: { id: 'assets', label: 'الشعارات والأختام والإعدادات والأرشيف' },
  school_whatsapp_monthly_template: { id: 'assets', label: 'الشعارات والأختام والإعدادات والأرشيف' },
  school_academic_years: { id: 'assets', label: 'الشعارات والأختام والإعدادات والأرشيف' },
  school_active_academic_year: { id: 'assets', label: 'الشعارات والأختام والإعدادات والأرشيف' },
  school_director_password: { id: 'assets', label: 'الشعارات والأختام والإعدادات والأرشيف' },
  school_apk_mode: { id: 'assets', label: 'الشعارات والأختام والإعدادات والأرشيف' },
  school_fcm_config: { id: 'assets', label: 'الشعارات والأختام والإعدادات والأرشيف' },
  school_exam_questions: { id: 'assets', label: 'الشعارات والأختام والإعدادات والأرشيف' }
};

function getUtf8ByteLength(str: string): number {
  if (!str) return 0;
  try {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str).length;
    }
    return new Blob([str]).size;
  } catch {
    return str.length * 2;
  }
}

export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(3)} GB`;
}

/**
 * Computes current Firestore storage consumption using 0 Firestore server reads
 * by inspecting all synced payloads + Firestore per-document metadata overhead,
 * optionally enhanced with live cloud document counts from `getCountFromServer`.
 */
export function calculateStorageUsageReport(
  cloudCounts?: CloudCollectionCounts | null
): StorageUsageReport {
  const categoryTotals: Record<string, { id: string; label: string; bytes: number; keysCount: number }> = {};

  let syncedPayloadBytes = 0;
  let studentCountEstimate = 0;

  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    for (const key of SYNC_KEYS) {
      const val = localStorage.getItem(key);
      if (val !== null) {
        // Document payload + ~96 bytes Firestore document path & field metadata overhead
        const docBytes = getUtf8ByteLength(val) + getUtf8ByteLength(key) + 96;
        syncedPayloadBytes += docBytes;

        const cat = CATEGORY_MAP[key] || { id: 'other', label: 'بيانات أخرى' };
        if (!categoryTotals[cat.id]) {
          categoryTotals[cat.id] = { id: cat.id, label: cat.label, bytes: 0, keysCount: 0 };
        }
        categoryTotals[cat.id].bytes += docBytes;
        categoryTotals[cat.id].keysCount += 1;

        if (key === 'school_students') {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) studentCountEstimate = parsed.length;
          } catch {
            // ignore
          }
        }
      }
    }
  }

  // Account for per-student consolidated docs (`students_grades/{id}`) & auxiliary collections
  const consolidatedCount = cloudCounts ? cloudCounts.consolidatedGrades : studentCountEstimate;
  const legacyCount = cloudCounts ? cloudCounts.legacyGrades : 0;
  const notificationsCount = cloudCounts ? cloudCounts.notifications : 0;
  const fcmCount = cloudCounts ? cloudCounts.fcmTokens : 0;
  const systemStatsCount = cloudCounts ? cloudCounts.systemStats : 1;

  // Each consolidated student grade doc is ~850 bytes (map of 7 subjects + metadata + index entry)
  const consolidatedDocsBytes = consolidatedCount * 850;
  if (consolidatedDocsBytes > 0) {
    if (!categoryTotals['grades']) {
      categoryTotals['grades'] = {
        id: 'grades',
        label: 'الدرجات والتقييمات وكشوف العلامات',
        bytes: 0,
        keysCount: 0
      };
    }
    categoryTotals['grades'].bytes += consolidatedDocsBytes;
  }

  const auxBytes =
    legacyCount * 380 +
    notificationsCount * 420 +
    fcmCount * 260 +
    systemStatsCount * 250;

  if (auxBytes > 0) {
    if (!categoryTotals['messages']) {
      categoryTotals['messages'] = {
        id: 'messages',
        label: 'المراسلات والتعاميم والأعذار',
        bytes: 0,
        keysCount: 0
      };
    }
    categoryTotals['messages'].bytes += notificationsCount * 420 + fcmCount * 260;
    if (legacyCount > 0 && categoryTotals['grades']) {
      categoryTotals['grades'].bytes += legacyCount * 380;
    }
  }

  // Approximate Firestore index overhead (~10% of raw doc bytes for built-in single-field indexes)
  const rawTotalBytes = syncedPayloadBytes + consolidatedDocsBytes + auxBytes;
  const estimatedFirestoreBytes = Math.round(rawTotalBytes * 1.1);
  const remainingFreeBytes = Math.max(0, FIRESTORE_SPARK_STORAGE_LIMIT_BYTES - estimatedFirestoreBytes);
  const percentUsed = Math.min(100, (estimatedFirestoreBytes / FIRESTORE_SPARK_STORAGE_LIMIT_BYTES) * 100);

  // Measure actual browser localStorage footprint (used by client cache)
  let localStorageUsedBytes = 0;
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) {
          const v = localStorage.getItem(k) || '';
          localStorageUsedBytes += (k.length + v.length) * 2; // UTF-16 in browser localStorage
        }
      }
    } catch {
      // ignore
    }
  }

  const breakdownSum = Object.values(categoryTotals).reduce((acc, item) => acc + item.bytes, 0) || 1;
  const breakdown: StorageCategoryBreakdown[] = Object.values(categoryTotals)
    .sort((a, b) => b.bytes - a.bytes)
    .map(item => ({
      id: item.id,
      label: item.label,
      bytes: item.bytes,
      formattedSize: formatStorageBytes(item.bytes),
      percentageOfUsed: Math.round((item.bytes / breakdownSum) * 100),
      keysCount: item.keysCount
    }));

  return {
    estimatedFirestoreBytes,
    estimatedFirestoreFormatted: formatStorageBytes(estimatedFirestoreBytes),
    remainingFreeBytes,
    remainingFreeFormatted: formatStorageBytes(remainingFreeBytes),
    limitBytes: FIRESTORE_SPARK_STORAGE_LIMIT_BYTES,
    limitFormatted: '1,024 MB (1 GiB)',
    percentUsed,
    localStorageUsedBytes,
    localStorageFormatted: formatStorageBytes(localStorageUsedBytes),
    localStoragePercent: Math.min(100, (localStorageUsedBytes / BROWSER_LOCAL_STORAGE_LIMIT_BYTES) * 100),
    breakdown,
    cloudCounts: cloudCounts || null
  };
}

/**
 * Runs lightweight `getCountFromServer` aggregation queries across Firestore collections
 * (counts as ~1 read per 1,000 index entries, properly logged to `trackFirestoreRead`).
 */
export async function measureLiveCloudStorageAudit(): Promise<StorageUsageReport> {
  if (!db || isFirestoreQuotaExceeded()) {
    return calculateStorageUsageReport(null);
  }

  const counts: CloudCollectionCounts = {
    schoolLiveData: 0,
    consolidatedGrades: 0,
    legacyGrades: 0,
    notifications: 0,
    fcmTokens: 0,
    systemStats: 0,
    measuredAt: Date.now()
  };

  try {
    const [
      liveSnap,
      consolidatedSnap,
      legacySnap,
      notifSnap,
      fcmSnap,
      statsSnap
    ] = await Promise.all([
      getCountFromServer(collection(db, 'school_live_data')).catch(() => null),
      getCountFromServer(collection(db, 'students_grades')).catch(() => null),
      getCountFromServer(collection(db, 'student_grades')).catch(() => null),
      getCountFromServer(collection(db, 'notifications')).catch(() => null),
      getCountFromServer(collection(db, 'fcm_tokens')).catch(() => null),
      getCountFromServer(collection(db, 'system_stats')).catch(() => null)
    ]);

    counts.schoolLiveData = liveSnap?.data()?.count || 0;
    counts.consolidatedGrades = consolidatedSnap?.data()?.count || 0;
    counts.legacyGrades = legacySnap?.data()?.count || 0;
    counts.notifications = notifSnap?.data()?.count || 0;
    counts.fcmTokens = fcmSnap?.data()?.count || 0;
    counts.systemStats = statsSnap?.data()?.count || 0;

    // Each aggregation query consumes at least 1 read unit (1 per 1000 entries)
    const aggReads =
      Math.max(1, Math.ceil(counts.schoolLiveData / 1000)) +
      Math.max(1, Math.ceil(counts.consolidatedGrades / 1000)) +
      Math.max(1, Math.ceil(counts.legacyGrades / 1000)) +
      Math.max(1, Math.ceil(counts.notifications / 1000)) +
      Math.max(1, Math.ceil(counts.fcmTokens / 1000)) +
      Math.max(1, Math.ceil(counts.systemStats / 1000));

    trackFirestoreRead(aggReads, 'فحص سعة التخزين السحابية');
  } catch (err: any) {
    if (isQuotaError(err)) {
      markFirestoreQuotaExceeded(err);
    }
  }

  return calculateStorageUsageReport(counts);
}

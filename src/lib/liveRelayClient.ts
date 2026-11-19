/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SentGradeSheet } from '../types';

export interface LiveRelayKeyUpdate {
  key: string;
  value: string;
  updatedAt: number;
}

export interface LiveRelaySnapshot {
  keys: Record<string, { value: string; updatedAt: number }>;
  gradeReports: Record<string, SentGradeSheet & { updatedAt?: number }>;
  deletedGradeReportIds?: Record<string, number>;
}

type KeyUpdateCallback = (update: LiveRelayKeyUpdate) => void;
type GradeReportListener = (event: {
  type: 'upsert' | 'delete' | 'snapshot';
  report?: SentGradeSheet;
  id?: string;
  reports?: SentGradeSheet[];
}) => void;

let relayAvailable: boolean | null = null;
let eventSource: EventSource | null = null;
let keyUpdateHandler: KeyUpdateCallback | null = null;
const gradeReportListeners = new Set<GradeReportListener>();
const cachedRelayGradeReports = new Map<string, SentGradeSheet & { updatedAt?: number }>();
const deletedGradeReportIds = new Map<string, number>();

function sortGradeReports(list: SentGradeSheet[]): SentGradeSheet[] {
  return [...list].sort(
    (a, b) => (new Date(b.dateSent || 0).getTime() || 0) - (new Date(a.dateSent || 0).getTime() || 0)
  );
}

export function getCachedRelayGradeReports(): SentGradeSheet[] {
  return sortGradeReports(Array.from(cachedRelayGradeReports.values()));
}

export function getDeletedRelayGradeReportIds(): Map<string, number> {
  return deletedGradeReportIds;
}

function emitGradeReportEvent(event: {
  type: 'upsert' | 'delete' | 'snapshot';
  report?: SentGradeSheet;
  id?: string;
  reports?: SentGradeSheet[];
}) {
  gradeReportListeners.forEach((listener) => {
    try {
      listener(event);
    } catch {}
  });
}

function applySnapshotGradeReports(
  gradeReports: Record<string, SentGradeSheet & { updatedAt?: number }> | undefined,
  deletedIds?: Record<string, number>
) {
  if (deletedIds && typeof deletedIds === 'object') {
    for (const [id, ts] of Object.entries(deletedIds)) {
      const prev = deletedGradeReportIds.get(id) || 0;
      const numTs = Number(ts) || 0;
      if (numTs > prev) {
        deletedGradeReportIds.set(id, numTs);
        cachedRelayGradeReports.delete(id);
      }
    }
  }

  let changed = false;
  if (gradeReports && typeof gradeReports === 'object') {
    for (const [id, report] of Object.entries(gradeReports)) {
      if (!report || !id) continue;
      const incomingTs = Number(report.updatedAt) || 0;
      const deletedTs = deletedGradeReportIds.get(id) || 0;
      if (deletedTs > incomingTs) continue;
      const existing = cachedRelayGradeReports.get(id);
      const existingTs = Number(existing?.updatedAt) || 0;
      if (!existing || incomingTs >= existingTs) {
        cachedRelayGradeReports.set(id, { ...report, id: report.id || id });
        changed = true;
      }
    }
  }

  if (changed || (deletedIds && Object.keys(deletedIds).length > 0)) {
    emitGradeReportEvent({
      type: 'snapshot',
      reports: getCachedRelayGradeReports()
    });
  }
}

export async function fetchLiveRelaySnapshot(): Promise<LiveRelaySnapshot | null> {
  if (typeof window === 'undefined' || relayAvailable === false) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch('/api/live-relay/snapshot', {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal
    });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      if (res.status === 404 || contentType.includes('text/html')) {
        relayAvailable = false;
      }
      return null;
    }
    const data = await res.json();
    if (!data || data.ok !== true) return null;
    relayAvailable = true;

    const keys = (data.keys && typeof data.keys === 'object' ? data.keys : {}) as LiveRelaySnapshot['keys'];
    const gradeReports = (
      data.gradeReports && typeof data.gradeReports === 'object' ? data.gradeReports : {}
    ) as LiveRelaySnapshot['gradeReports'];
    const deleted = (
      data.deletedGradeReportIds && typeof data.deletedGradeReportIds === 'object'
        ? data.deletedGradeReportIds
        : {}
    ) as Record<string, number>;

    if (keyUpdateHandler) {
      for (const [key, rec] of Object.entries(keys)) {
        if (rec && typeof rec.value === 'string') {
          keyUpdateHandler({
            key,
            value: rec.value,
            updatedAt: Number(rec.updatedAt) || 0
          });
        }
      }
    }
    applySnapshotGradeReports(gradeReports, deleted);

    return { keys, gradeReports, deletedGradeReportIds: deleted };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function pushLiveRelayKey(key: string, value: string, updatedAt: number): Promise<boolean> {
  if (typeof window === 'undefined' || relayAvailable === false) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const res = await fetch('/api/live-relay/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, updatedAt }),
      keepalive: true
    });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      if (res.status === 404 || contentType.includes('text/html')) {
        relayAvailable = false;
      }
      return false;
    }
    relayAvailable = true;
    return true;
  } catch {
    return false;
  }
}

export async function pushLiveRelayGradeReport(report: SentGradeSheet & { updatedAt?: number }): Promise<boolean> {
  if (typeof window === 'undefined' || !report?.id) return false;
  const enriched = { ...report, updatedAt: Number(report.updatedAt) || Date.now() };
  cachedRelayGradeReports.set(report.id, enriched);
  deletedGradeReportIds.delete(report.id);

  if (relayAvailable === false) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const res = await fetch('/api/live-relay/grade-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report: enriched }),
      keepalive: true
    });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      if (res.status === 404 || contentType.includes('text/html')) {
        relayAvailable = false;
      }
      return false;
    }
    relayAvailable = true;
    return true;
  } catch {
    return false;
  }
}

export async function deleteLiveRelayGradeReport(reportId: string): Promise<boolean> {
  if (typeof window === 'undefined' || !reportId) return false;
  cachedRelayGradeReports.delete(reportId);
  deletedGradeReportIds.set(reportId, Date.now());

  if (relayAvailable === false) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const res = await fetch(`/api/live-relay/grade-report/${encodeURIComponent(reportId)}`, {
      method: 'DELETE',
      keepalive: true
    });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      if (res.status === 404 || contentType.includes('text/html')) {
        relayAvailable = false;
      }
      return false;
    }
    relayAvailable = true;
    return true;
  } catch {
    return false;
  }
}

export function subscribeLiveRelayGradeReports(listener: GradeReportListener): () => void {
  gradeReportListeners.add(listener);
  return () => {
    gradeReportListeners.delete(listener);
  };
}

export function startLiveRelayClient(onKeyUpdate: KeyUpdateCallback): void {
  keyUpdateHandler = onKeyUpdate;
  if (typeof window === 'undefined' || relayAvailable === false) return;

  // Always pull current snapshot once right away
  fetchLiveRelaySnapshot().catch(() => {});

  if (eventSource || typeof EventSource === 'undefined') return;

  try {
    const es = new EventSource('/api/live-relay/stream');
    eventSource = es;

    es.addEventListener('ready', () => {
      relayAvailable = true;
      fetchLiveRelaySnapshot().catch(() => {});
    });

    es.addEventListener('key_update', (evt: MessageEvent) => {
      try {
        const payload = JSON.parse(evt.data) as LiveRelayKeyUpdate;
        if (payload && payload.key && typeof payload.value === 'string' && keyUpdateHandler) {
          keyUpdateHandler({
            key: payload.key,
            value: payload.value,
            updatedAt: Number(payload.updatedAt) || Date.now()
          });
        }
      } catch {}
    });

    es.addEventListener('grade_report_upsert', (evt: MessageEvent) => {
      try {
        const payload = JSON.parse(evt.data) as { report?: SentGradeSheet & { updatedAt?: number } };
        const report = payload?.report;
        if (report && report.id) {
          const incomingTs = Number(report.updatedAt) || Date.now();
          const deletedTs = deletedGradeReportIds.get(report.id) || 0;
          if (deletedTs > incomingTs) return;
          deletedGradeReportIds.delete(report.id);
          cachedRelayGradeReports.set(report.id, report);
          emitGradeReportEvent({
            type: 'upsert',
            report,
            reports: getCachedRelayGradeReports()
          });
        }
      } catch {}
    });

    es.addEventListener('grade_report_delete', (evt: MessageEvent) => {
      try {
        const payload = JSON.parse(evt.data) as { id?: string; deletedAt?: number };
        if (payload?.id) {
          deletedGradeReportIds.set(payload.id, Number(payload.deletedAt) || Date.now());
          cachedRelayGradeReports.delete(payload.id);
          emitGradeReportEvent({
            type: 'delete',
            id: payload.id,
            reports: getCachedRelayGradeReports()
          });
        }
      } catch {}
    });

    es.onerror = () => {
      // If server endpoint is missing on a static host, avoid infinite reconnect errors
      if (relayAvailable === false) {
        es.close();
        eventSource = null;
      }
    };
  } catch {
    // Graceful fallback if EventSource cannot initialize
  }
}

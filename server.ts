import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

interface RelayKeyRecord {
  value: string;
  updatedAt: number;
}

interface RelayStore {
  keys: Record<string, RelayKeyRecord>;
  gradeReports: Record<string, Record<string, unknown>>;
  deletedGradeReportIds: Record<string, number>;
}

const RELAY_PERSIST_PATH = '/tmp/school_live_relay.json';
const sseClients = new Set<Response>();

function loadInitialStore(): RelayStore {
  try {
    if (fs.existsSync(RELAY_PERSIST_PATH)) {
      const raw = fs.readFileSync(RELAY_PERSIST_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<RelayStore>;
      if (parsed && typeof parsed === 'object') {
        return {
          keys: parsed.keys && typeof parsed.keys === 'object' ? parsed.keys : {},
          gradeReports: parsed.gradeReports && typeof parsed.gradeReports === 'object' ? parsed.gradeReports : {},
          deletedGradeReportIds:
            parsed.deletedGradeReportIds && typeof parsed.deletedGradeReportIds === 'object'
              ? parsed.deletedGradeReportIds
              : {}
        };
      }
    }
  } catch {
    // Start cleanly if temp relay file is corrupt or unreadable
  }
  return {
    keys: {},
    gradeReports: {},
    deletedGradeReportIds: {}
  };
}

const store: RelayStore = loadInitialStore();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersistStore() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    fsPromises
      .writeFile(RELAY_PERSIST_PATH, JSON.stringify(store), 'utf-8')
      .catch(() => {});
  }, 150);
}

function isEmptyPayloadString(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === '' || trimmed === '[]' || trimmed === '{}';
}

function broadcastSse(eventName: string, data: unknown) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/live-relay/health', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      clients: sseClients.size,
      keys: Object.keys(store.keys).length,
      gradeReports: Object.keys(store.gradeReports).length
    });
  });

  app.get('/api/live-relay/snapshot', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      keys: store.keys,
      gradeReports: store.gradeReports,
      deletedGradeReportIds: store.deletedGradeReportIds
    });
  });

  app.get('/api/live-relay/stream', (req: Request, res: Response) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    sseClients.add(res);
    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, ts: Date.now() })}\n\n`);

    const keepAlive = setInterval(() => {
      try {
        res.write(`:ping ${Date.now()}\n\n`);
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  app.post('/api/live-relay/key', (req: Request, res: Response) => {
    const body = req.body as { key?: unknown; value?: unknown; updatedAt?: unknown } | undefined;
    const key = typeof body?.key === 'string' ? body.key.trim() : '';
    const value = typeof body?.value === 'string' ? body.value : '';
    const incomingUpdatedAt = Number(body?.updatedAt) || Date.now();

    if (!key) {
      res.status(400).json({ ok: false, error: 'missing_key' });
      return;
    }

    const existing = store.keys[key];
    // Never overwrite populated data with an empty initialization array/object
    if (existing && !isEmptyPayloadString(existing.value) && isEmptyPayloadString(value)) {
      res.json({ ok: true, ignored: 'anti_wipe', updatedAt: existing.updatedAt });
      return;
    }

    if (existing && incomingUpdatedAt < existing.updatedAt) {
      res.json({ ok: true, ignored: 'stale', updatedAt: existing.updatedAt });
      return;
    }

    if (existing && existing.value === value && incomingUpdatedAt === existing.updatedAt) {
      res.json({ ok: true, unchanged: true, updatedAt: existing.updatedAt });
      return;
    }

    const nextRecord: RelayKeyRecord = { value, updatedAt: incomingUpdatedAt };
    store.keys[key] = nextRecord;
    schedulePersistStore();
    broadcastSse('key_update', { key, value, updatedAt: incomingUpdatedAt });
    res.json({ ok: true, updatedAt: incomingUpdatedAt });
  });

  app.post('/api/live-relay/grade-report', (req: Request, res: Response) => {
    const body = req.body as { report?: Record<string, unknown> } | undefined;
    const report = body?.report;
    const reportId = typeof report?.id === 'string' ? report.id.trim() : '';

    if (!report || !reportId) {
      res.status(400).json({ ok: false, error: 'missing_report_id' });
      return;
    }

    const incomingTs = Number(report.updatedAt) || Date.now();
    const deletedTs = store.deletedGradeReportIds[reportId] || 0;
    if (deletedTs > incomingTs) {
      res.json({ ok: true, ignored: 'deleted' });
      return;
    }
    delete store.deletedGradeReportIds[reportId];

    const existing = store.gradeReports[reportId];
    const existingTs = Number(existing?.updatedAt) || 0;
    if (existing && incomingTs < existingTs) {
      res.json({ ok: true, ignored: 'stale', report: existing });
      return;
    }

    const normalized = { ...report, id: reportId, updatedAt: incomingTs };
    store.gradeReports[reportId] = normalized;
    schedulePersistStore();
    broadcastSse('grade_report_upsert', { report: normalized });
    res.json({ ok: true, report: normalized });
  });

  app.delete('/api/live-relay/grade-report/:id', (req: Request, res: Response) => {
    const reportId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!reportId) {
      res.status(400).json({ ok: false, error: 'missing_report_id' });
      return;
    }

    const deletedAt = Date.now();
    delete store.gradeReports[reportId];
    store.deletedGradeReportIds[reportId] = deletedAt;
    schedulePersistStore();
    broadcastSse('grade_report_delete', { id: reportId, deletedAt });
    res.json({ ok: true, id: reportId, deletedAt });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    // Production Word download fallback + static SPA serving
    const prodPaperStore = new Map<string, { html: string; filename: string; timestamp: number }>();
    app.post('/api/store-paper-for-download', (req: Request, res: Response) => {
      const data = req.body as { id?: string; html?: string; filename?: string } | undefined;
      const id = data?.id || `paper_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      prodPaperStore.set(id, {
        html: data?.html || '',
        filename: data?.filename || 'exam_questions.doc',
        timestamp: Date.now()
      });
      res.json({ success: true, downloadUrl: `/api/download-doc?token=${id}` });
    });

    app.get('/api/download-doc', (req: Request, res: Response) => {
      const token = typeof req.query.token === 'string' ? req.query.token : '';
      const entry = token ? prodPaperStore.get(token) : undefined;
      if (!entry) {
        res
          .status(404)
          .type('text/html; charset=utf-8')
          .send('<div dir="rtl" style="font-family:sans-serif;padding:30px;text-align:center;"><h2>عفواً، رابط التحميل منتهي الصلاحية أو غير متوفر.</h2></div>');
        return;
      }
      const rawFilename = entry.filename.endsWith('.doc') ? entry.filename : `${entry.filename}.doc`;
      const encodedFilename = encodeURIComponent(rawFilename);
      const contentBuffer = Buffer.concat([Buffer.from('\uFEFF', 'utf-8'), Buffer.from(entry.html, 'utf-8')]);
      res.setHeader('Content-Type', 'application/msword; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
      );
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(contentBuffer);
    });

    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`[School Live Relay Server] Listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Express + Vite server:', err);
  process.exit(1);
});

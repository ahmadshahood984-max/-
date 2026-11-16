import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

function wordDownloadPlugin(): Plugin {
  const paperStore = new Map<string, { html: string; filename: string; timestamp: number }>();

  // Periodically clean up entries older than 30 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of paperStore.entries()) {
      if (now - val.timestamp > 30 * 60 * 1000) {
        paperStore.delete(key);
      }
    }
  }, 15 * 60 * 1000);

  return {
    name: 'word-download-server',
    configureServer(server) {
      server.middlewares.use('/api/store-paper-for-download', (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const id = data.id || `paper_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
              paperStore.set(id, {
                html: data.html || '',
                filename: data.filename || 'exam_questions.doc',
                timestamp: Date.now()
              });
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, downloadUrl: `/api/download-doc?token=${id}` }));
            } catch (err: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        } else {
          res.statusCode = 405;
          res.end('Method Not Allowed');
        }
      });

      server.middlewares.use('/api/download-doc', (req, res) => {
        const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
        const token = urlObj.searchParams.get('token');
        const entry = token ? paperStore.get(token) : null;

        if (!entry) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end('<div dir="rtl" style="font-family:sans-serif;padding:30px;text-align:center;"><h2>عفواً، رابط التحميل منتهي الصلاحية أو غير متوفر.</h2><p>يرجى العودة للتطبيق والنقر على "تصدير Word" مرة أخرى.</p></div>');
          return;
        }

        const rawFilename = entry.filename.endsWith('.doc') ? entry.filename : `${entry.filename}.doc`;
        const encodedFilename = encodeURIComponent(rawFilename);
        const bom = Buffer.from('\uFEFF', 'utf-8');
        const contentBuffer = Buffer.concat([bom, Buffer.from(entry.html, 'utf-8')]);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/msword; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
        res.setHeader('Content-Length', String(contentBuffer.length));
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.end(contentBuffer);
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), wordDownloadPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      target: ['chrome70', 'safari12', 'firefox60', 'edge79', 'es2015'],
      cssTarget: ['chrome70', 'safari12', 'firefox60', 'edge79'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

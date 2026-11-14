import express from 'express';

interface AppOptions {
  pythonApiUrl?: string;
  frontendOrigin?: string;
  gitSha?: string;
  pythonTimeoutMs?: number;
}

export function createApp({
  pythonApiUrl = process.env.PYTHON_API_URL,
  frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  gitSha = process.env.GIT_SHA ?? 'development',
  pythonTimeoutMs = 30_000,
}: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.vary('Origin');
    if (req.get('Origin') === frontendOrigin) {
      res.set('Access-Control-Allow-Origin', frontendOrigin);
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.get('/healthz', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'ok', service: 'spherex-api', version: gitSha });
  });
  app.post('/api/consulta', async (req, res) => {
    if (!pythonApiUrl) {
      res.status(503).json({ erro: 'Serviço Python ainda não configurado.' });
      return;
    }
    try {
      const response = await fetch(new URL('/receber-dados', pythonApiUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(pythonTimeoutMs),
      });
      res.status(response.status).json(await response.json());
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      res.status(timedOut ? 504 : 502).json({ erro: 'Falha na comunicação com FastAPI' });
    }
  });
  return app;
}

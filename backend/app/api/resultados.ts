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
  // O Python fica só na rede interna: a API repassa as chamadas e reescreve os
  // caminhos /espectros/... para o prefixo público /api/espectros/...
  const publicPaths = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return value.startsWith('/espectros/') || value.startsWith('/sequencias/') ? `/api${value}` : value;
    }
    if (Array.isArray(value)) return value.map(publicPaths);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, publicPaths(item)]));
    }
    return value;
  };
  const callPython = async (path: string, res: express.Response, init: RequestInit = {}) => {
    if (!pythonApiUrl) {
      res.status(503).json({ erro: 'Serviço Python ainda não configurado.' });
      return null;
    }
    try {
      return await fetch(new URL(path, pythonApiUrl), {
        ...init,
        signal: AbortSignal.timeout(pythonTimeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      res.status(timedOut ? 504 : 502).json({ erro: 'Falha na comunicação com FastAPI' });
      return null;
    }
  };
  const relayJson = async (path: string, res: express.Response, init: RequestInit = {}) => {
    const response = await callPython(path, res, init);
    if (!response) return;
    try {
      res.status(response.status).json(publicPaths(await response.json()));
    } catch {
      res.status(502).json({ erro: 'Resposta inválida do FastAPI' });
    }
  };
  const relayFile = async (path: string, contentType: string, res: express.Response) => {
    const response = await callPython(path, res);
    if (!response) return;
    if (!response.ok) {
      res.status(response.status).json({ erro: 'Arquivo não encontrado.' });
      return;
    }
    res.status(200);
    res.set('Content-Type', contentType);
    res.set('Cache-Control', response.headers.get('cache-control') ?? 'public, max-age=86400');
    res.send(Buffer.from(await response.arrayBuffer()));
  };
  const forwardConsulta = (payload: unknown, res: express.Response) => relayJson('/receber-dados', res, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  app.get('/api/consulta', async (req, res) => {
    const { RA, DEC, Data, elemento, bandas, tema, modo, perfil, cor, referencia } = req.query;
    const ra = typeof RA === 'string' && RA.trim() ? Number(RA) : Number.NaN;
    const dec = typeof DEC === 'string' && DEC.trim() ? Number(DEC) : Number.NaN;
    if (!Number.isFinite(ra) || !Number.isFinite(dec) ||
        typeof Data !== 'string' || !Data.trim() || Number.isNaN(Date.parse(Data))) {
      res.status(400).json({ erro: 'Informe RA, DEC e Data válidos na query.' });
      return;
    }
    if (elemento !== undefined && elemento !== 'imagem' && elemento !== 'espectro') {
      res.status(400).json({ erro: 'elemento deve ser "imagem" (padrão) ou "espectro".' });
      return;
    }
    if (tema !== undefined && tema !== 'escuro' && tema !== 'claro') {
      res.status(400).json({ erro: 'tema deve ser "escuro" ou "claro".' });
      return;
    }
    if (bandas !== undefined && typeof bandas !== 'string') {
      res.status(400).json({ erro: 'bandas deve ser uma lista separada por vírgulas, ex.: D1,D3.' });
      return;
    }
    const options = { modo, perfil, cor, referencia };
    for (const [name, value] of Object.entries(options)) {
      if (value !== undefined && (typeof value !== 'string' || !/^[A-Za-z0-9-]{1,20}$/.test(value))) {
        res.status(400).json({ erro: `${name} inválido.` });
        return;
      }
    }
    const payload: Record<string, unknown> = { RA: ra, DEC: dec, Data };
    if (elemento) payload.elemento = elemento;
    if (tema) payload.tema = tema;
    for (const [name, value] of Object.entries(options)) {
      if (value) payload[name] = value;
    }
    if (bandas) payload.bandas = bandas.split(',').map((band) => band.trim()).filter(Boolean);
    await forwardConsulta(payload, res);
  });
  app.post('/api/consulta', async (req, res) => {
    await forwardConsulta(req.body, res);
  });
  app.get('/api/sequencias/:jobId', async (req, res) => {
    if (!/^[0-9a-f]{16}$/.test(req.params.jobId)) {
      res.status(400).json({ erro: 'Identificador de sequência inválido.' });
      return;
    }
    await relayJson(`/sequencias/${req.params.jobId}`, res);
  });
  app.get('/api/sequencias/arquivos/:dataset/frames/:variant/:file', async (req, res) => {
    const { dataset, variant, file } = req.params;
    if (!/^[0-9a-f]{16}$/.test(dataset) || !/^[a-z]+-(?:color|mono)$/.test(variant) ||
        !/^[A-Za-z0-9._-]+\.webp$/.test(file)) {
      res.status(404).json({ erro: 'Imagem não encontrada.' });
      return;
    }
    await relayFile(`/sequencias/arquivos/${dataset}/frames/${variant}/${file}`, 'image/webp', res);
  });
  app.get('/api/espectros/:jobId', async (req, res) => {
    if (!/^[0-9a-f]{16}$/.test(req.params.jobId)) {
      res.status(400).json({ erro: 'Identificador de espectro inválido.' });
      return;
    }
    await relayJson(`/espectros/${req.params.jobId}`, res);
  });
  app.get('/api/espectros/arquivos/:dataset/spectrum/:file', async (req, res) => {
    const { dataset, file } = req.params;
    if (!/^[0-9a-f]{16}$/.test(dataset) || !/^[A-Za-z0-9._-]+\.svg$/.test(file)) {
      res.status(404).json({ erro: 'Gráfico não encontrado.' });
      return;
    }
    await relayFile(`/espectros/arquivos/${dataset}/spectrum/${file}`, 'image/svg+xml', res);
  });
  return app;
}

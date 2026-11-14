import express from 'express';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function createFrontendApp(dist = fileURLToPath(new URL('./dist', import.meta.url))) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/healthz', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'ok', service: 'spherex-frontend', version: process.env.GIT_SHA ?? 'development' });
  });
  app.use('/assets', express.static(resolve(dist, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(dist, { maxAge: 0 }));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !extname(req.path) && req.accepts('html')) {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(resolve(dist, 'index.html'));
    } else next();
  });
  return app;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8080);
  const server = createFrontendApp().listen(port, '0.0.0.0', () => console.log(`SPHEREx frontend na porta ${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}

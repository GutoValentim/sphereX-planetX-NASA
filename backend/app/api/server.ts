import { createApp } from './resultados.js';

const port = Number(process.env.PORT ?? 3000);
const server = createApp().listen(port, '0.0.0.0', () => {
  console.log(`SPHEREx API iniciada na porta ${port}`);
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}

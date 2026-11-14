import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFrontendApp } from '../server.mjs';

test('production server serves the SPA, healthcheck, and real asset errors', async () => {
  const dist = await mkdtemp(join(tmpdir(), 'spherex-front-'));
  await writeFile(join(dist, 'index.html'), '<html>SPHEREx</html>');
  const server = createFrontendApp(dist).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${url}/healthz`)).status, 200);
    const page = await fetch(`${url}/explorer`, { headers: { Accept: 'text/html' } });
    assert.match(await page.text(), /SPHEREx/);
    assert.equal((await fetch(`${url}/assets/missing.js`)).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dist, { recursive: true, force: true });
  }
});

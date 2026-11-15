import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { afterEach, test } from 'node:test';
import { createApp } from '../app/api/resultados.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  })));
});
async function listen(server: Server) {
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}
test('healthcheck identifies the commit and permits only the configured origin', async () => {
  const url = await listen(createServer(createApp({ gitSha: 'release123', frontendOrigin: 'https://front.example' })));
  const response = await fetch(`${url}/healthz`, { headers: { Origin: 'https://front.example' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://front.example');
  assert.equal((await response.json()).version, 'release123');
  const other = await fetch(`${url}/healthz`, { headers: { Origin: 'https://other.example' } });
  assert.equal(other.headers.get('access-control-allow-origin'), null);
});
test('consultation returns 503 until Python is configured', async () => {
  const url = await listen(createServer(createApp({ pythonApiUrl: '' })));
  const response = await fetch(`${url}/api/consulta`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 503);
  assert.match((await response.json()).erro, /Python/);
});
test('consultation forwards the request and preserves the Python response status', async () => {
  const upstream = await listen(createServer(async (req, res) => {
    assert.equal(req.url, '/receber-dados');
    assert.equal(req.method, 'POST');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), { RA: 215, DEC: -23 });
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accepted: true }));
  }));
  const url = await listen(createServer(createApp({ pythonApiUrl: upstream })));
  const response = await fetch(`${url}/api/consulta`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ RA: 215, DEC: -23 }) });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { accepted: true });
});
test('GET consultation forwards query parameters and returns the Python data', async () => {
  const upstream = await listen(createServer(async (req, res) => {
    assert.equal(req.url, '/receber-dados');
    assert.equal(req.method, 'POST');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), {
      RA: 215.341667,
      DEC: -23.55052,
      Data: '2026-11-14',
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ observations: [] }));
  }));
  const url = await listen(createServer(createApp({ pythonApiUrl: upstream })));
  const response = await fetch(`${url}/api/consulta?RA=215.341667&DEC=-23.55052&Data=2026-11-14`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { observations: [] });
});
test('GET consultation rejects invalid query parameters', async () => {
  const url = await listen(createServer(createApp({ pythonApiUrl: 'http://127.0.0.1:1' })));
  const response = await fetch(`${url}/api/consulta?RA=&DEC=-23&Data=invalid`);
  assert.equal(response.status, 400);
  assert.match((await response.json()).erro, /RA, DEC e Data/);
});
test('unreachable Python service returns a gateway error', async () => {
  const url = await listen(createServer(createApp({ pythonApiUrl: 'http://127.0.0.1:1' })));
  const response = await fetch(`${url}/api/consulta`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 502);
});
test('Python request timeout returns 504', async () => {
  const upstream = await listen(createServer(() => {}));
  const url = await listen(createServer(createApp({ pythonApiUrl: upstream, pythonTimeoutMs: 20 })));
  const response = await fetch(`${url}/api/consulta`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 504);
});
test('GET consultation forwards the spectrum element and rewrites internal URLs', async () => {
  const upstream = await listen(createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), {
      RA: 10, DEC: -5, Data: '2026-11-14', elemento: 'espectro', tema: 'claro', bandas: ['D1', 'D3'],
    });
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ elemento: 'espectro', status_url: '/espectros/0123456789abcdef', job: { job_id: '0123456789abcdef' } }));
  }));
  const url = await listen(createServer(createApp({ pythonApiUrl: upstream })));
  const response = await fetch(`${url}/api/consulta?RA=10&DEC=-5&Data=2026-11-14&elemento=espectro&bandas=D1,%20D3&tema=claro`);
  assert.equal(response.status, 202);
  assert.equal((await response.json()).status_url, '/api/espectros/0123456789abcdef');
});
test('GET consultation rejects an unknown element', async () => {
  const url = await listen(createServer(createApp({ pythonApiUrl: 'http://127.0.0.1:1' })));
  const response = await fetch(`${url}/api/consulta?RA=10&DEC=-5&Data=2026-11-14&elemento=video`);
  assert.equal(response.status, 400);
  assert.match((await response.json()).erro, /elemento/);
});
test('spectrum status and SVG files are proxied from Python', async () => {
  const upstream = await listen(createServer((req, res) => {
    if (req.url === '/espectros/0123456789abcdef') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'completed', result: { combined_chart_url: '/espectros/arquivos/0123456789abcdef/spectrum/combined-dark-aa.svg', bands: [{ chart_url: null }] } }));
      return;
    }
    if (req.url === '/espectros/arquivos/0123456789abcdef/spectrum/combined-dark-aa.svg') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=31536000, immutable' });
      res.end('<svg xmlns="http://www.w3.org/2000/svg"/>');
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end('{"erro":"x"}');
  }));
  const url = await listen(createServer(createApp({ pythonApiUrl: upstream })));
  const status = await fetch(`${url}/api/espectros/0123456789abcdef`);
  const body = await status.json();
  assert.equal(body.result.combined_chart_url, '/api/espectros/arquivos/0123456789abcdef/spectrum/combined-dark-aa.svg');
  assert.equal(body.result.bands[0].chart_url, null);
  const chart = await fetch(`${url}${body.result.combined_chart_url}`);
  assert.equal(chart.status, 200);
  assert.equal(chart.headers.get('content-type'), 'image/svg+xml');
  assert.match(chart.headers.get('cache-control') ?? '', /immutable/);
  assert.match(await chart.text(), /<svg/);
  assert.equal((await fetch(`${url}/api/espectros/arquivos/0123456789abcdef/spectrum/missing.svg`)).status, 404);
});
test('spectrum routes validate identifiers before calling Python', async () => {
  const url = await listen(createServer(createApp({ pythonApiUrl: 'http://127.0.0.1:1' })));
  assert.equal((await fetch(`${url}/api/espectros/not-a-job`)).status, 400);
  assert.equal((await fetch(`${url}/api/espectros/arquivos/0123456789abcdef/spectrum/x.fits`)).status, 404);
  assert.equal((await fetch(`${url}/api/espectros/arquivos/abc/spectrum/x.svg`)).status, 404);
});
test('image consultation forwards sequence options and exposes frames through /api', async () => {
  const upstream = await listen(createServer(async (req, res) => {
    if (req.url === '/receber-dados') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), {
        RA: 10, DEC: -5, Data: '2026-11-14', bandas: ['D1', 'D3'], modo: 'balanceada', cor: 'mono', referencia: 'D1',
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ observations: [], sequencia: { status_url: '/sequencias/aaaaaaaaaaaaaaaa' } }));
      return;
    }
    if (req.url === '/sequencias/aaaaaaaaaaaaaaaa') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ frames: [{ layers: [{ image_url: '/sequencias/arquivos/0123456789abcdef/frames/limpa-color/001_a.webp?v=8' }] }] }));
      return;
    }
    if (req.url === '/sequencias/arquivos/0123456789abcdef/frames/limpa-color/001_a.webp') {
      res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=86400' });
      res.end(Buffer.from('RIFF0000WEBP'));
      return;
    }
    res.writeHead(404).end();
  }));
  const url = await listen(createServer(createApp({ pythonApiUrl: upstream })));
  const first = await fetch(`${url}/api/consulta?RA=10&DEC=-5&Data=2026-11-14&bandas=D1,D3&modo=balanceada&cor=mono&referencia=D1`);
  const body = await first.json();
  assert.equal(body.sequencia.status_url, '/api/sequencias/aaaaaaaaaaaaaaaa');
  const sequence = await (await fetch(`${url}${body.sequencia.status_url}`)).json();
  const imageUrl = sequence.frames[0].layers[0].image_url;
  assert.equal(imageUrl, '/api/sequencias/arquivos/0123456789abcdef/frames/limpa-color/001_a.webp?v=8');
  const image = await fetch(`${url}${imageUrl}`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/webp');
  assert.equal((await fetch(`${url}/api/sequencias/arquivos/0123456789abcdef/fits/x/a.fits`)).status, 404);
  assert.equal((await fetch(`${url}/api/consulta?RA=10&DEC=-5&Data=2026-11-14&modo=a%20b`)).status, 400);
});
test('catalog keeps the published engine until a newer export is 100% ready', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'spherex-catalog-'));
  const bands = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'].map((band) => `SPHEREx-${band}`);
  const complete = (engine: string) => JSON.stringify({
    engine,
    sequences: [{ bandpasses: bands, omitted_bandpasses: [] }],
    spectrum: Object.fromEntries(['dark', 'light'].map((theme) => [theme, {
      bands: bands.map((bandpass) => ({ bandpass, chart_url: `spectrum/${theme}/${bandpass}.svg`, error: null })),
    }])),
  });
  const partial = (engine: string) => JSON.stringify({
    engine,
    sequences: [{ bandpasses: bands.slice(0, 3), omitted_bandpasses: bands.slice(3) }],
    spectrum: {},
  });
  try {
    const target = (id: string, slug: string, name: string) => ({ id, slug, name, ra_deg: 1, dec_deg: 2, manifest: `${slug}/manifest.json` });
    for (const engine of ['v1', 'v2']) {
      for (const slug of ['vega-aaa', 'deneb-ccc']) await mkdir(join(root, engine, slug, 'frames'), { recursive: true });
    }
    await mkdir(join(root, 'v2', 'altair-bbb'), { recursive: true });
    await writeFile(join(root, 'v1', 'index.json'), JSON.stringify({ targets: [target('aaa', 'vega-aaa', 'Vega'), target('ccc', 'deneb-ccc', 'Deneb'), { id: 'x', slug: '../etc' }] }));
    await writeFile(join(root, 'v2', 'index.json'), JSON.stringify({ targets: [target('aaa', 'vega-aaa', 'Vega v2'), target('ccc', 'deneb-ccc', 'Deneb v2'), target('bbb', 'altair-bbb', 'Altair')] }));
    // Vega: v2 still partial → v1 stays. Deneb: v2 complete → v2 replaces v1. Altair: only v2 (partial).
    await writeFile(join(root, 'v1', 'vega-aaa', 'manifest.json'), partial('v1'));
    await writeFile(join(root, 'v1', 'vega-aaa', 'frames', 'a.webp'), 'webp v1');
    await writeFile(join(root, 'v2', 'vega-aaa', 'manifest.json'), partial('v2'));
    await writeFile(join(root, 'v1', 'deneb-ccc', 'manifest.json'), complete('v1'));
    await writeFile(join(root, 'v2', 'deneb-ccc', 'manifest.json'), complete('v2'));
    await writeFile(join(root, 'v2', 'altair-bbb', 'manifest.json'), partial('v2'));
    await writeFile(join(root, 'CREDENTIALS.txt'), 'secret');

    const url = await listen(createServer(createApp({ catalogDir: root })));
    const index = await (await fetch(`${url}/api/catalogo/index.json`)).json();
    assert.deepEqual(index.targets.map((item: { name: string; engine: string }) => `${item.name}@${item.engine}`), ['Altair@v2', 'Deneb v2@v2', 'Vega@v1']);

    assert.equal((await (await fetch(`${url}/api/catalogo/vega-aaa/manifest.json`)).json()).engine, 'v1');
    assert.equal(await (await fetch(`${url}/api/catalogo/vega-aaa/frames/a.webp`)).text(), 'webp v1');
    assert.equal((await (await fetch(`${url}/api/catalogo/deneb-ccc/manifest.json`)).json()).engine, 'v2');
    // Files come only from the chosen engine: Deneb's v1 frames are not mixed in.
    assert.equal((await fetch(`${url}/api/catalogo/deneb-ccc/frames/a.webp`)).status, 404);
    for (const path of ['vega-aaa/..%2F..%2FCREDENTIALS.txt', 'vega-aaa/../../CREDENTIALS.txt', 'Vega/manifest.json', 'vega-aaa/manifest.txt']) {
      assert.equal((await fetch(`${url}/api/catalogo/${path}`)).status, 404, path);
    }

    // When the newer export becomes complete, it takes over (manifests are re-read when they change).
    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeFile(join(root, 'v2', 'vega-aaa', 'manifest.json'), complete('v2'));
    assert.equal((await (await fetch(`${url}/api/catalogo/vega-aaa/manifest.json`)).json()).engine, 'v2');

    const unconfigured = await listen(createServer(createApp({ catalogDir: '' })));
    assert.equal((await fetch(`${unconfigured}/api/catalogo/index.json`)).status, 503);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('catalog serves exported images with their content type', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'spherex-catalog-'));
  try {
    await mkdir(join(root, 'v1', 'vega-aaa', 'frames', '30-native', 'limpa-color', 'D1'), { recursive: true });
    await mkdir(join(root, 'v1', 'vega-aaa', 'spectrum', 'dark'), { recursive: true });
    await writeFile(join(root, 'v1', 'index.json'), JSON.stringify({ targets: [{ id: 'aaa', slug: 'vega-aaa', name: 'Vega' }] }));
    await writeFile(join(root, 'v1', 'vega-aaa', 'manifest.json'), '{}');
    await writeFile(join(root, 'v1', 'vega-aaa', 'frames', '30-native', 'limpa-color', 'D1', '001_x.webp'), 'webp');
    await writeFile(join(root, 'v1', 'vega-aaa', 'spectrum', 'dark', 'combined.svg'), '<svg/>');
    const url = await listen(createServer(createApp({ catalogDir: root })));
    const image = await fetch(`${url}/api/catalogo/vega-aaa/frames/30-native/limpa-color/D1/001_x.webp`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/webp');
    const chart = await fetch(`${url}/api/catalogo/vega-aaa/spectrum/dark/combined.svg`);
    assert.equal(chart.headers.get('content-type'), 'image/svg+xml');
    assert.equal(await chart.text(), '<svg/>');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

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

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
test('GET consultation returns the test text in the browser', async () => {
  const url = await listen(createServer(createApp({ pythonApiUrl: '' })));
  const response = await fetch(`${url}/api/consulta`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/plain/);
  assert.equal(await response.text(), 'Texto de teste');
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

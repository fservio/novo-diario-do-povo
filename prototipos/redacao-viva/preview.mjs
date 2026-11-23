import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', webp: 'image/webp' };
const files = new Set(['index.html', 'app.js', 'style.css', 'redacao.webp',
  'jornalista-1.webp', 'jornalista-2.webp', 'jornalista-3.webp', 'agente-sentado-1.webp', 'agente-sentado-2.webp']);
const worldPreview = process.argv.includes('--mundo-em-edicao');
const port = worldPreview ? 4193 : 4192;
const directory = new URL(worldPreview ? '../mundo-em-edicao/' : './', import.meta.url);
const worldFiles = new Set(['index.html', 'app.js', 'style.css']);
let cachedFeed;
let pendingFeed;

function loadFeed() {
  if (cachedFeed && cachedFeed.expiresAt > Date.now()) return cachedFeed.xml;
  pendingFeed ??= (async () => {
    const response = await fetch('https://diario.dopovo.com.br/rss.xml', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const xml = await response.text();
    cachedFeed = { xml, expiresAt: Date.now() + 45000 };
    return xml;
  })().finally(() => { pendingFeed = undefined; });
  return pendingFeed;
}

createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (request.method !== 'GET') return response.writeHead(405, { Allow: 'GET' }).end();
  if (path === '/rss.xml') {
    try {
      const xml = await loadFeed();
      return response.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'no-store' }).end(xml);
    } catch {
      return response.writeHead(502).end();
    }
  }
  const name = path === '/' ? 'index.html' : path.slice(1);
  if (!(worldPreview ? worldFiles : files).has(name)) return response.writeHead(404).end();
  try {
    const data = await readFile(new URL(name, directory));
    const type = mime[name.split('.').pop()];
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(data);
  } catch {
    response.writeHead(404).end();
  }
}).listen(port, '127.0.0.1', () => console.log(`Prévia · http://127.0.0.1:${port}/`));

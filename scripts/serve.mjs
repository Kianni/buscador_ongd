import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 3000);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') pathname = '/mvp/index.html';
    const allowed = pathname.startsWith('/mvp/') || pathname.startsWith('/data/mvp_data/');
    const target = path.resolve(root, '.' + pathname);
    const relative = path.relative(root, target);
    if (!allowed || relative.startsWith('..') || path.isAbsolute(relative) || pathname.includes('\\') || pathname.includes('\0')) {
      response.writeHead(404); response.end('Not found'); return;
    }
    // Only public UI files and the three fixtures are served.
    const publicRoot = pathname.startsWith('/mvp/') ? path.join(root, 'mvp') : path.join(root, 'data', 'mvp_data');
    const withinPublic = path.relative(publicRoot, target);
    if (withinPublic.startsWith('..') || path.isAbsolute(withinPublic)) { response.writeHead(404); response.end('Not found'); return; }
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) { response.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 400); response.end('File unavailable'); }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Порт ${port} занят. Запустите на другом порту: $env:PORT=3001; npm.cmd start` : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`ONGD MVP: http://localhost:${port}`));

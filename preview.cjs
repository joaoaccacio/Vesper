// Local development preview. The delivered index.html also opens directly offline.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const routes = new Set(['index.html', 'qa.html', 'vesper-engine.js', 'vesper-ui.js']);
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  const name = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!routes.has(name)) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(__dirname, name), (error, data) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
server.listen(4173, '127.0.0.1', () => process.stdout.write('Vesper preview: http://127.0.0.1:4173\n'));

/*
 * serve.js — fallback static server for machines with no Python.
 *
 * Modern macOS ships no Python at all: typing `python3` pops the Xcode
 * Command Line Tools installer, which is not an acceptable first experience.
 * Node is far more likely to already be there, so start.sh falls through to
 * this. It uses only built-in modules — nothing to install.
 *
 *   node serve.js [port]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.argv[2]) || 8099;
const root = __dirname;

/* Correct types matter: the app is ES modules, and a browser refuses to run
   a module served as text/plain. */
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
  '.pdf': 'application/pdf', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const full = path.resolve(root, rel);

  /* Never serve anything outside the folder. The separator matters: without
     it a sibling directory whose name starts with the same characters would
     pass the prefix test. */
  if (full !== root && !full.startsWith(root + path.sep)) { res.writeHead(403).end('Forbidden'); return; }

  fs.stat(full, (err, stat) => {
    const target = !err && stat.isDirectory() ? path.join(full, 'index.html') : full;
    fs.readFile(target, (err2, data) => {
      if (err2) { res.writeHead(404, { 'content-type': 'text/plain' }).end(`Not found: ${rel}`); return; }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
        /*
         * Never cache.
         *
         * Without this the browser keeps the previous copy of every module,
         * so replacing the folder with a newer version changes nothing on
         * screen — the instructor updates the app and still sees the old one,
         * with nothing to explain why. On localhost there is no bandwidth to
         * save and being correct matters more.
         */
        'cache-control': 'no-store, must-revalidate',
        pragma: 'no-cache',
        expires: '0'
      });
      res.end(data);
    });
  });
}).listen(port, '127.0.0.1', () => console.log(`Serving ${root} on http://localhost:${port}`));

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

const server = http.createServer((req, res) => {
  // Decode URL and normalize path
  let decodedUrl;
  try {
    decodedUrl = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    decodedUrl = req.url.split('?')[0];
  }

  let filePath = path.join(ROOT, decodedUrl === '/' ? 'index.html' : decodedUrl);

  // Security check: ensure path stays within ROOT
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      // If path didn't exist, try falling back to public if requested path omitted it
      const publicPath = path.join(ROOT, 'public', decodedUrl);
      fs.stat(publicPath, (err2, stats2) => {
        if (!err2 && stats2.isFile()) {
          serveFile(publicPath, res);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
        }
      });
      return;
    }

    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    serveFile(filePath, res);
  });
});

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Server Error: ' + err.code);
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.png' ? 'public, max-age=86400' : 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(content);
  });
}

server.listen(PORT, () => {
  console.log(`\n🚀 Interactive Avatar Server running at: http://localhost:${PORT}`);
  console.log(`📂 Serving directory: ${ROOT}\n`);
});

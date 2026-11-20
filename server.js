// Zero-dependency server: serves the page and the JSON API (auth, roles, per-store data). See docs/ARCHITECTURE-style notes in CLAUDE.md.
//   Data lives in data/ (override with DATA_DIR). PORT and HOST env vars as before.
const http = require('http'), fs = require('fs'), path = require('path');
const { createDb } = require('./server/db'), { createApi } = require('./server/api');

function createApp(opts = {}) {
  const dataDir = opts.dataDir || process.env.DATA_DIR || path.join(__dirname, 'data');
  const api = createApi(createDb(dataDir), { dataDir, ...(opts.signupOpen === undefined ? {} : { signupOpen: opts.signupOpen }) });
  return http.createServer(async (req, res) => {
    try {
      if (await api(req, res)) return;
      const url = req.url.split('?')[0];
      if (url === '/' || url === '/index.html') {
        try {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY' });
          return res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html')));
        } catch (e) { res.writeHead(500, { 'content-type': 'text/plain' }); return res.end('Run "npm run build" first.'); }
      }
      res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found');
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Server error' }));
    }
  });
}
module.exports = { createApp };

if (require.main === module) {
  const PORT = +process.env.PORT || 3000, HOST = process.env.HOST || '127.0.0.1';
  createApp().listen(PORT, HOST, () => console.log(`Jewellery billing running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (data: ${process.env.DATA_DIR || 'data/'})`));
}

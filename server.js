// Custom Next server that records the client's IP the way a reverse proxy
// would. It reads the socket address and sets x-forwarded-for, so logActivity
// (which already reads that header) captures an IP even in local dev.
//
// Run it instead of `next dev` / `next start`:
//   dev:   node server.js
//   prod:  next build   then   NODE_ENV=production node server.js
//
// In real production you'll usually sit behind nginx/Caddy, which sets
// x-forwarded-for itself — this server leaves an existing one untouched,
// so it's safe there too.

const { createServer } = require('http');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    if (!req.headers['x-forwarded-for']) {
      const ip = req.socket.remoteAddress;
      if (ip) req.headers['x-forwarded-for'] = ip;
    }
    handle(req, res);
  }).listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`> Atlas ready on http://localhost:${port}`);
  });
});
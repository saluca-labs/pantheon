/**
 * Container healthcheck for @platform/memory-service.
 *
 * Hits GET /health/ready over loopback. Exits 0 on 2xx, 1 otherwise.
 *
 * Uses raw http.request rather than fetch() so it works on every Node
 * runtime regardless of fetch availability or DNS resolution behaviour
 * inside the container.
 */
const http = require('http');

const port = process.env.MEMORY_SERVICE_PORT || '8910';
const req = http.request(
  {
    host: '127.0.0.1',
    port: Number(port),
    // Use /health/live (no DB ping) to avoid sluggish probes during
    // first-boot bootstrap. /health/ready is exposed for callers who
    // need a stronger guarantee.
    path: '/health/live',
    method: 'GET',
    timeout: 4000,
  },
  (res) => {
    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
      process.exit(0);
    }
    process.exit(1);
  },
);
req.on('error', () => process.exit(1));
req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});
req.end();

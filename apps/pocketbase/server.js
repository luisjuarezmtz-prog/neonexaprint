import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import httpProxy from 'http-proxy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PB_BINARY = path.join(__dirname, 'pocketbase');

const PB_HOST = '127.0.0.1';
const PB_PORT = 8090;
const PUBLIC_PORT = process.env.PORT || 3000;

// git on Windows doesn't preserve the unix executable bit, so force it here
// instead of depending on the bit surviving clone/checkout on the server.
try {
  fs.chmodSync(PB_BINARY, 0o755);
} catch (err) {
  console.error('could not chmod pocketbase binary:', err.message);
}

function startPocketBase() {
  const pb = spawn(
    PB_BINARY,
    [
      'serve',
      `--http=${PB_HOST}:${PB_PORT}`,
      '--encryptionEnv=PB_ENCRYPTION_KEY',
      '--dir=./pb_data',
      '--migrationsDir=./pb_migrations',
      '--hooksDir=./pb_hooks',
      '--hooksWatch=false',
    ],
    { cwd: __dirname, stdio: 'inherit' }
  );

  pb.on('exit', (code) => {
    console.error(`pocketbase exited with code ${code}, restarting in 3s...`);
    setTimeout(startPocketBase, 3000);
  });

  pb.on('error', (err) => {
    console.error('failed to start pocketbase binary:', err);
  });
}

startPocketBase();

const proxy = httpProxy.createProxyServer({
  target: `http://${PB_HOST}:${PB_PORT}`,
});

proxy.on('error', (err, req, res) => {
  console.error('proxy error:', err.message);
  if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
  res.end('Backend starting up, try again in a moment.');
});

const server = http.createServer((req, res) => proxy.web(req, res));

server.listen(PUBLIC_PORT, () => {
  console.log(`Proxy listening on ${PUBLIC_PORT}, forwarding to pocketbase on ${PB_HOST}:${PB_PORT}`);
});

import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import httpProxy from 'http-proxy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PB_HOST = '127.0.0.1';
const PB_PORT = 8090;
const PUBLIC_PORT = process.env.PORT || 3000;

function startPocketBase() {
  const pb = spawn(
    path.join(__dirname, 'pocketbase'),
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

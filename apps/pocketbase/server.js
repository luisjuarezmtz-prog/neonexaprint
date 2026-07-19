import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PB_BINARY = path.join(__dirname, 'pocketbase');

// Cloud Startup wipes this app's own directory on every redeploy, so the
// database must live outside it (in the account home) to survive deploys.
const PB_DATA_DIR = path.join(os.homedir(), 'neonexa_pb_data');
fs.mkdirSync(PB_DATA_DIR, { recursive: true });

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

let currentChild = null;
let shuttingDown = false;

function startPocketBase() {
  const pb = spawn(
    PB_BINARY,
    [
      'serve',
      `--http=${PB_HOST}:${PB_PORT}`,
      '--encryptionEnv=PB_ENCRYPTION_KEY',
      `--dir=${PB_DATA_DIR}`,
      '--migrationsDir=./pb_migrations',
      '--hooksDir=./pb_hooks',
      '--hooksWatch=false',
    ],
    { cwd: __dirname, stdio: 'inherit' }
  );

  currentChild = pb;

  pb.on('exit', (code) => {
    if (shuttingDown) return;
    console.error(`pocketbase exited with code ${code}, restarting in 3s...`);
    setTimeout(startPocketBase, 3000);
  });

  pb.on('error', (err) => {
    console.error('failed to start pocketbase binary:', err);
  });
}

startPocketBase();

// Passenger stops/replaces this process on redeploy/idle without killing
// children first, orphaning pocketbase and leaving 8090 bound on next boot.
function shutdown() {
  shuttingDown = true;
  if (currentChild) currentChild.kill('SIGTERM');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Plain Node http proxy — no external dependency, since this host's deploy
// step strips node_modules regardless of what's committed to git.
const server = http.createServer((clientReq, clientRes) => {
  const proxyReq = http.request(
    {
      host: PB_HOST,
      port: PB_PORT,
      path: clientReq.url,
      method: clientReq.method,
      headers: clientReq.headers,
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes);
    }
  );

  proxyReq.on('error', (err) => {
    console.error('proxy error:', err.message);
    if (!clientRes.headersSent) clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
    clientRes.end('Backend starting up, try again in a moment.');
  });

  clientReq.pipe(proxyReq);
});

server.listen(PUBLIC_PORT, () => {
  console.log(`Proxy listening on ${PUBLIC_PORT}, forwarding to pocketbase on ${PB_HOST}:${PB_PORT}`);
});

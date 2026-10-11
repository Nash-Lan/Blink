import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';

const host = '127.0.0.1';
const port = Number(process.env.BLINK_PLAYWRIGHT_WEB_PORT ?? 8170);
const baseURL = `http://${host}:${port}`;
const pidFile = join(process.cwd(), 'tmp', 'playwright-expo-web.pid');

export async function startExpoWebServer() {
  await assertPortAvailable(port);

  const expoCli = join(process.cwd(), 'node_modules', 'expo', 'bin', 'cli');
  const child = spawn(process.execPath, [expoCli, 'start', '--web', '--port', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BLINK_PLAYWRIGHT_WEB_SERVER: '1',
      CI: process.env.CI ?? '1',
    },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk) => process.stdout.write(`[ExpoWeb] ${chunk}`));
  child.stderr?.on('data', (chunk) => process.stderr.write(`[ExpoWeb] ${chunk}`));

  await mkdir(dirname(pidFile), { recursive: true });
  await writeFile(pidFile, String(child.pid), 'utf8');

  try {
    await waitForServer(child);
  } catch (error) {
    await stopExpoWebServer();
    throw error;
  }
}

export async function stopExpoWebServer() {
  let pidText = '';
  try {
    pidText = await readFile(pidFile, 'utf8');
  } catch {
    return;
  } finally {
    await rm(pidFile, { force: true });
  }

  const pid = Number(pidText.trim());
  if (!Number.isInteger(pid) || pid <= 0) {
    return;
  }

  await killProcessTree(pid);
}

function assertPortAvailable(value) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (error) => {
      reject(new Error(`Port ${value} is already in use. Stop the existing server or choose another BLINK_PLAYWRIGHT_WEB_PORT before running e2e tests. Original error: ${error.message}`));
    });
    server.listen(value, host, () => {
      server.close(() => resolve());
    });
  });
}

async function waitForServer(child) {
  const startedAt = Date.now();
  let exit = null;
  child.once('exit', (code, signal) => {
    exit = { code, signal };
  });

  while (Date.now() - startedAt < 120_000) {
    if (exit) {
      throw new Error(`Expo web server exited early with code ${exit.code ?? 'null'} and signal ${exit.signal ?? 'null'}.`);
    }
    try {
      const response = await fetch(baseURL);
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Expo web server did not become ready at ${baseURL} within 120s.`);
}

function killProcessTree(pid) {
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      killer.on('exit', () => resolve());
      killer.on('error', () => resolve());
    });
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, 500));
}

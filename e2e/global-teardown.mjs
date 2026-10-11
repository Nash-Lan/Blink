import { stopExpoWebServer } from './server.mjs';

export default async function globalTeardown() {
  await stopExpoWebServer();
}

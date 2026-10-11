import { startExpoWebServer } from './server.mjs';

export default async function globalSetup() {
  await startExpoWebServer();
}

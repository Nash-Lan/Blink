import type { NativeNotificationAdapter } from './types';

export const nativeNotificationAdapter: NativeNotificationAdapter = {
  supported: false,
  configureForegroundHandler() {},
  async getPermissionStatus() { return 'unsupported'; },
  async requestPermission() { return 'unsupported'; },
  async listScheduled() { return []; },
  async schedule() { throw new Error('Native notifications are unavailable on web.'); },
  async cancel() {},
  getLastResponse() { return null; },
  clearLastResponse() {},
  subscribeToResponses() { return () => undefined; },
};

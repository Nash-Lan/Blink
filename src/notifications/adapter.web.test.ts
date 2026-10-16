import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-notifications', () => {
  throw new Error('The web adapter must not import expo-notifications.');
});

describe('web notification adapter', () => {
  it('does not load or invoke native notification APIs', async () => {
    const { nativeNotificationAdapter } = await import('./adapter.web');
    expect(nativeNotificationAdapter.supported).toBe(false);
    await expect(nativeNotificationAdapter.getPermissionStatus()).resolves.toBe('unsupported');
    await expect(nativeNotificationAdapter.listScheduled()).resolves.toEqual([]);
    expect(nativeNotificationAdapter.getLastResponse()).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { permissionForExplicitEnable } from './permissions';

describe('native notification permission requests', () => {
  it('requests permission only after explicit enable while status is undetermined', async () => {
    const controller = {
      getPermissionStatus: vi.fn(async () => 'undetermined' as const),
      requestPermission: vi.fn(async () => 'provisional' as const),
    };

    await expect(permissionForExplicitEnable(controller)).resolves.toBe('provisional');
    expect(controller.requestPermission).toHaveBeenCalledOnce();
  });

  it.each(['granted', 'provisional', 'ephemeral', 'denied'] as const)('does not request again for %s status', async (status) => {
    const controller = {
      getPermissionStatus: vi.fn(async () => status),
      requestPermission: vi.fn(async () => status),
    };

    await expect(permissionForExplicitEnable(controller)).resolves.toBe(status);
    expect(controller.requestPermission).not.toHaveBeenCalled();
  });
});

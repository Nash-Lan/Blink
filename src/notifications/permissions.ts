import type { NativeNotificationPermission } from './types';

type PermissionController = {
  getPermissionStatus(): Promise<NativeNotificationPermission>;
  requestPermission(): Promise<NativeNotificationPermission>;
};

export async function permissionForExplicitEnable(controller: PermissionController): Promise<NativeNotificationPermission> {
  const current = await controller.getPermissionStatus();
  return current === 'undetermined' ? controller.requestPermission() : current;
}

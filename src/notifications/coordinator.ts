import type { Deadline } from '../domain/schema';
import { reminderKey } from '../domain/reminders';
import { SerialTaskQueue } from '../state/commitQueue';
import type {
  NativeNotificationAdapter,
  NativeNotificationPermission,
  NotificationBinding,
  NotificationBindingStore,
} from './types';

export function notificationPermissionAllowsScheduling(permission: NativeNotificationPermission): boolean {
  return permission === 'granted' || permission === 'provisional' || permission === 'ephemeral';
}

function desiredBinding(deadline: Deadline, now: Date): { deadline: Deadline; reminderKey: string; reminderAt: Date } | null {
  const key = reminderKey(deadline);
  const reminderAt = deadline.reminderAt ? new Date(deadline.reminderAt) : null;
  if (!key || !reminderAt || deadline.completedAt || !Number.isFinite(reminderAt.getTime()) || reminderAt.getTime() <= now.getTime()) {
    return null;
  }
  return { deadline, reminderKey: key, reminderAt };
}

export class NativeNotificationCoordinator {
  private readonly queue = new SerialTaskQueue();
  private generation = 0;
  private deadlines: Deadline[] = [];
  private enabled = false;

  constructor(
    private readonly adapter: NativeNotificationAdapter,
    private readonly bindingStore: NotificationBindingStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  updatePlan(deadlines: Deadline[], enabled: boolean): void {
    this.deadlines = deadlines;
    this.enabled = enabled;
    this.generation += 1;
  }

  get supported(): boolean {
    return this.adapter.supported;
  }

  configureForegroundHandler(): void {
    this.adapter.configureForegroundHandler();
  }

  getPermissionStatus(): Promise<NativeNotificationPermission> {
    return this.adapter.getPermissionStatus();
  }

  requestPermission(): Promise<NativeNotificationPermission> {
    return this.adapter.requestPermission();
  }

  reconcileAll(): Promise<NativeNotificationPermission> {
    const requestedGeneration = ++this.generation;
    return this.queue.enqueue(() => this.runReconcile(requestedGeneration));
  }

  private async runReconcile(requestedGeneration: number): Promise<NativeNotificationPermission> {
    if (!this.adapter.supported) return 'unsupported';
    const permission = await this.adapter.getPermissionStatus();
    const [scheduled, storedBindings] = await Promise.all([
      this.adapter.listScheduled(),
      this.bindingStore.load(),
    ]);
    const scheduledIds = new Set(scheduled.map((item) => item.notificationId));
    const canceledIds = new Set<string>();
    const cancel = async (notificationId: string) => {
      if (canceledIds.has(notificationId)) return;
      await this.adapter.cancel(notificationId);
      canceledIds.add(notificationId);
    };

    if (!this.enabled || !notificationPermissionAllowsScheduling(permission)) {
      // listScheduled is namespaced by the adapter. A stale/corrupt local mapping
      // alone is not enough evidence that an ID still belongs to Blink.
      for (const notificationId of new Set(scheduled.map((item) => item.notificationId))) {
        await cancel(notificationId);
      }
      await this.bindingStore.save([]);
      return permission;
    }

    const desired = new Map<string, NonNullable<ReturnType<typeof desiredBinding>>>();
    for (const deadline of this.deadlines) {
      const candidate = desiredBinding(deadline, this.now());
      if (candidate) desired.set(deadline.id, candidate);
    }

    const finalBindings: NotificationBinding[] = [];
    const retainedDeadlineIds = new Set<string>();
    for (const notification of scheduled) {
      const target = desired.get(notification.deadlineId);
      if (
        target
        && target.reminderKey === notification.reminderKey
        && (notification.title === undefined || notification.title === target.deadline.title)
        && !retainedDeadlineIds.has(notification.deadlineId)
      ) {
        finalBindings.push({
          notificationId: notification.notificationId,
          deadlineId: notification.deadlineId,
          reminderKey: notification.reminderKey,
        });
        retainedDeadlineIds.add(notification.deadlineId);
      } else {
        await cancel(notification.notificationId);
      }
    }

    // A binding whose notification is absent from the system list is stale and can be dropped.
    for (const binding of storedBindings) {
      if (!scheduledIds.has(binding.notificationId)) continue;
      if (finalBindings.some((item) => item.notificationId === binding.notificationId)) continue;
      const target = desired.get(binding.deadlineId);
      if (!target || target.reminderKey !== binding.reminderKey) {
        await cancel(binding.notificationId);
      }
    }

    const newlyScheduled: NotificationBinding[] = [];
    try {
      for (const target of desired.values()) {
        if (retainedDeadlineIds.has(target.deadline.id)) continue;
        const notificationId = await this.adapter.schedule({
          deadlineId: target.deadline.id,
          reminderKey: target.reminderKey,
          title: target.deadline.title,
          reminderAt: target.reminderAt,
        });
        const latest = this.deadlines.find((item) => item.id === target.deadline.id);
        const latestDesired = latest ? desiredBinding(latest, this.now()) : null;
        if (
          requestedGeneration !== this.generation
          || !this.enabled
          || latestDesired?.reminderKey !== target.reminderKey
        ) {
          await cancel(notificationId);
          continue;
        }
        const binding = { deadlineId: target.deadline.id, notificationId, reminderKey: target.reminderKey };
        newlyScheduled.push(binding);
        finalBindings.push(binding);
      }
      if (requestedGeneration !== this.generation) {
        for (const binding of newlyScheduled) await cancel(binding.notificationId);
        return permission;
      }
      await this.bindingStore.save(finalBindings);
      return permission;
    } catch (error) {
      for (const binding of newlyScheduled) {
        try {
          await cancel(binding.notificationId);
        } catch {
          // The next system-list reconciliation will recover metadata from any orphaned Blink notification.
        }
      }
      throw error;
    }
  }
}

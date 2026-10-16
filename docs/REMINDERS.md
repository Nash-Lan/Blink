# In-app reminders — v0.2.0 Phase 1

## Scope and behavior

- Create and edit reminders in the existing DDL sheets used by Today and Deadlines. Notes keep their existing flow.
- Reminders are off by default. Enable at the due time, 5/15/30 minutes, 1 hour, or 1 day before it, or enter a custom local date and time. Existing 10-minute reminders remain editable.
- Turning reminders off or removing the setting saves `reminderAt: null`; the deadline remains intact. There is no second reminder model.
- Inputs use `YYYY-MM-DD` and 24-hour `HH:mm`. Invalid calendar dates, overflow, and nonexistent local times are rejected. A newly configured reminder must be in the future. Past deadlines remain supported for overdue tracking.
- Editing only the title preserves an existing reminder exactly, including seconds/milliseconds and historical timestamps. Changing a relative preset or due time recalculates the timestamp. Custom reminders remain absolute times.
- Presets are elapsed durations; one day means 24 hours. Entered local times become ISO timestamps. The UI displays them in the device's current timezone. This is not a recurring or timezone-pinned reminder system.

## Delivery and persistence

The existing Provider owns a single foreground timer. It wakes at the next due reminder, with a maximum 15-second recheck for wall-clock changes. `AppState` gates scheduling; returning to the foreground checks overdue, unseen reminders. There is no background or native notification delivery in this phase.

The existing `reminderHistory` stores a fingerprint of deadline ID, due time, and reminder time. History is saved through the same serialized storage queue before presenting a Banner. Repeated timer checks, dismissal, and app reload therefore do not show the same schedule again. If several reminders are due, the oldest unseen one is presented; dismissing or invalidating it allows the next one.

Banner validity is derived from the latest deadline. Editing the schedule, disabling/removing the reminder, deleting the deadline, or completing it invalidates the old event. Writes revalidate the event inside the queue to reject stale selections. Mutations also clear invalid candidates, so completing and then undoing completion cannot revive a previously displayed Banner. Undo restores an unseen reminder if it has become due.

Web uses the existing IndexedDB snapshot; native uses the existing SQLite snapshot. The schema's default empty history keeps old snapshots/backups compatible. Backup restore uses the same write queue to avoid racing reminder history writes. History is retained when a reminder is disabled or its deadline is completed/deleted.

If saving history fails, the Banner is not presented and the Provider retries after 15 seconds. As with the existing persistence model, storage availability is necessary for durable delivery. A process termination between saving history and rendering its Banner may consume that reminder: this phase favors avoiding duplicates and does not promise exactly-once visual delivery across crashes.

## Verification

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `npx expo-doctor`

Vitest covers strict parsing, preset calculation, cross-day/month/year offsets, history, stale-event rejection, completion/Undo semantics, and snapshot/backup compatibility with fixed dates. Playwright covers the real Provider, forms, IndexedDB reloads, clock-driven delivery, and the existing v0.1.0 workflows. Its existing server setup/teardown owns the Expo process and port; reminder tests do not start their own server.

## Next phase

1. Verify the existing SQLite adapter on a physical iOS device: clean install, upgrade from an older snapshot, save/edit/disable, force quit/relaunch, complete/Undo, and backup restore. Include a write failure and foreground return. Browser IndexedDB tests do not verify native SQLite.
2. Exercise timezone changes and daylight-saving transitions on device. Nonexistent local times are rejected; ambiguous fall-back times currently follow JavaScript's local Date interpretation without an offset selector.
3. Add native notification scheduling only after the persistence checks. Keep `reminderAt` as the source of truth, add the minimal native request-ID bookkeeping needed to cancel/reschedule on edit, disable, completion, delete, and restore, and define permission-denial and foreground presentation behavior. Avoid duplicate OS notifications and in-app Banners.
4. Validate native notification behavior on iOS development builds with the SDK 57 documentation, including app termination, denied/revoked permissions, overdue schedules, and device timezone changes. Do not assume JavaScript foreground timers run in the background.

References: [React derived state guidance](https://react.dev/learn/you-might-not-need-an-effect), [React Native 0.86 AppState](https://reactnative.dev/docs/0.86/appstate), [Expo SDK 57 SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/).

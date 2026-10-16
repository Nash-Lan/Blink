import { expect, test, type Locator, type Page } from '@playwright/test';
import { defaultAppData, type AppData, type Deadline } from '../src/domain/schema';

// Keep local form values and persisted UTC timestamps independent of the host timezone.
test.use({ timezoneId: 'Asia/Shanghai' });

const now = '2030-05-06T01:00:00.000Z';

test('creates a cross-day preset, edits an exact reminder, and removes only the reminder', async ({ page }) => {
  const title = 'Cross-day reminder';
  await openDeadlines(page);
  await openCreateDeadline(page, title);
  await replaceText(page.getByLabel('Due date', { exact: true }), '2030-05-07', page);
  await replaceText(page.getByLabel('Due time', { exact: true }), '00:05', page);
  await page.getByRole('switch', { name: 'Reminder enabled' }).click();
  await page.getByRole('radio', { name: '15 min before', exact: true }).click();
  await saveSheet(page, 'Save');
  await expect.poll(async () => (await readSnapshot(page))?.deadlines[0].reminderAt).toBe('2030-05-06T15:50:00.000Z');

  await reloadDeadlines(page);
  await openEditor(page, title);
  await expect(page.getByRole('switch', { name: 'Reminder enabled' })).toBeChecked();
  await expect(page.getByRole('radio', { name: '15 min before', exact: true })).toBeChecked();
  await setCustomReminder(page, '2030-05-06', '13:45');
  await saveSheet(page, 'Done');
  await expect.poll(async () => (await readSnapshot(page))?.deadlines[0].reminderAt).toBe('2030-05-06T05:45:00.000Z');

  await reloadDeadlines(page);
  await openEditor(page, title);
  await expect(page.getByRole('radio', { name: 'Choose date & time', exact: true })).toBeChecked();
  await expect(page.getByLabel('Reminder date', { exact: true })).toHaveValue('2030-05-06');
  await expect(page.getByLabel('Reminder time', { exact: true })).toHaveValue('13:45');
  await page.getByRole('button', { name: 'Remove reminder', exact: true }).click();
  await saveSheet(page, 'Done');
  await reloadDeadlines(page);
  await expect(page.getByRole('button', { name: `Edit deadline ${title}` })).toBeVisible();
  expect((await readSnapshot(page))?.deadlines).toEqual([
    expect.objectContaining({ title, dueAt: '2030-05-06T16:05:00.000Z', reminderAt: null }),
  ]);
});

test('rejects impossible dates, invalid times, and past reminders without creating a deadline', async ({ page }) => {
  await openDeadlines(page);
  await openCreateDeadline(page, 'Strict date validation');
  await replaceText(page.getByLabel('Due date', { exact: true }), '2030-02-30', page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Date does not exist.', { exact: true })).toBeVisible();

  await replaceText(page.getByLabel('Due date', { exact: true }), '2030-05-06', page);
  await replaceText(page.getByLabel('Due time', { exact: true }), '24:00', page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Hour must be between 00 and 23.', { exact: true })).toBeVisible();

  await replaceText(page.getByLabel('Due time', { exact: true }), '12:00', page);
  await page.getByRole('switch', { name: 'Reminder enabled' }).click();
  await setCustomReminder(page, '2030-05-06', '25:70');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Hour must be between 00 and 23.', { exact: true })).toBeVisible();

  await replaceText(page.getByLabel('Reminder time', { exact: true }), '08:59', page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Reminder time must be in the future.', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await readSnapshot(page))?.deadlines).toHaveLength(0);
});

test('shows a due reminder once and restores its dismissed history after reload', async ({ page }) => {
  const deadline = makeDeadline('dismissed', 'Remember once');
  await openDeadlines(page, [deadline]);
  const banner = reminderBanner(page, deadline.title);
  await expect(banner).toHaveCount(0);

  await page.clock.fastForward(60_000);
  await expect(banner).toBeVisible();
  await expect.poll(async () => (await readSnapshot(page))?.reminderHistory.length).toBe(1);
  await page.clock.fastForward(30_000);
  await expect(banner).toBeVisible();
  expect((await readSnapshot(page))?.reminderHistory).toHaveLength(1);

  await banner.click();
  await page.clock.fastForward(60_000);
  await expect(banner).toHaveCount(0);
  await reloadDeadlines(page);
  await page.clock.fastForward(60_000);
  await expect(banner).toHaveCount(0);
  expect((await readSnapshot(page))?.reminderHistory).toEqual([
    expect.objectContaining({ deadlineId: deadline.id, reminderAt: deadline.reminderAt }),
  ]);
});

test('rescheduling and removing an active reminder immediately invalidate its old banner', async ({ page }) => {
  const deadline = makeDeadline('reschedule', 'Reschedule active reminder');
  await openDeadlines(page, [deadline]);
  const banner = reminderBanner(page, deadline.title);
  await page.clock.fastForward(60_000);
  await expect(banner).toBeVisible();

  await openEditor(page, deadline.title);
  await setCustomReminder(page, '2030-05-06', '09:05');
  await saveSheet(page, 'Done');
  await expect(banner).toHaveCount(0);
  await page.clock.fastForward(60_000);
  await expect(banner).toHaveCount(0);
  await page.clock.fastForward(180_000);
  await expect(banner).toBeVisible();
  expect((await readSnapshot(page))?.reminderHistory).toHaveLength(2);

  await openEditor(page, deadline.title);
  await page.getByRole('button', { name: 'Remove reminder', exact: true }).click();
  await saveSheet(page, 'Done');
  await expect(banner).toHaveCount(0);
  await page.clock.fastForward(60_000);
  await expect(banner).toHaveCount(0);
  expect((await readSnapshot(page))?.deadlines).toEqual([
    expect.objectContaining({ id: deadline.id, reminderAt: null }),
  ]);
});

test('disabled reminders and deleted deadlines cannot trigger their old schedules', async ({ page }) => {
  const disabled = makeDeadline('disabled', 'Disable pending reminder');
  const deleted = makeDeadline('deleted', 'Delete pending deadline');
  await openDeadlines(page, [disabled, deleted]);
  await openEditor(page, disabled.title);
  await page.getByRole('switch', { name: 'Reminder enabled' }).click();
  await saveSheet(page, 'Done');
  await page.getByRole('button', { name: `Delete deadline ${deleted.title}` }).click();
  await expect(page.getByRole('button', { name: `Edit deadline ${deleted.title}` })).toHaveCount(0);
  await page.clock.fastForward(120_000);
  await expect(page.getByRole('button', { name: /^Dismiss reminder / })).toHaveCount(0);

  await reloadDeadlines(page);
  expect((await readSnapshot(page))?.deadlines).toEqual([
    expect.objectContaining({ id: disabled.id, reminderAt: null }),
  ]);
  expect((await readSnapshot(page))?.reminderHistory).toHaveLength(0);
  await expect(page.getByRole('button', { name: /^Dismiss reminder / })).toHaveCount(0);
});

test('completion suppresses new reminders and Undo never repeats a shown reminder', async ({ page }) => {
  const deadline = makeDeadline('completed', 'Complete and undo');
  await openDeadlines(page, [deadline]);
  const banner = reminderBanner(page, deadline.title);

  await page.getByRole('checkbox', { name: `Complete deadline ${deadline.title}` }).click();
  await expect(page.getByRole('checkbox', { name: `Reopen deadline ${deadline.title}` })).toBeChecked();
  await page.clock.fastForward(60_000);
  await expect(banner).toHaveCount(0);
  expect((await readSnapshot(page))?.reminderHistory).toHaveLength(0);

  await page.getByRole('button', { name: `Undo complete ${deadline.title}` }).click();
  await expect(page.getByRole('checkbox', { name: `Complete deadline ${deadline.title}` })).not.toBeChecked();
  await page.clock.runFor(1);
  await expect(banner).toBeVisible();
  await page.getByRole('checkbox', { name: `Complete deadline ${deadline.title}` }).click();
  await expect(banner).toHaveCount(0);
  await page.getByRole('button', { name: `Undo complete ${deadline.title}` }).click();
  await page.clock.fastForward(60_000);
  await expect(banner).toHaveCount(0);

  await reloadDeadlines(page);
  await expect(page.getByRole('checkbox', { name: `Complete deadline ${deadline.title}` })).not.toBeChecked();
  await expect(banner).toHaveCount(0);
  expect((await readSnapshot(page))?.reminderHistory).toHaveLength(1);
  expect((await readSnapshot(page))?.deadlines[0].completedAt).toBeNull();
});

test('dismissal advances through simultaneous due reminders without repeating either', async ({ page }) => {
  const first = makeDeadline('queue-first', 'First reminder');
  const second = makeDeadline('queue-second', 'Second reminder');
  await openDeadlines(page, [first, second]);
  await page.clock.fastForward(60_000);
  await expect(reminderBanner(page, first.title)).toBeVisible();
  await expect(reminderBanner(page, second.title)).toHaveCount(0);

  await reminderBanner(page, first.title).click();
  await expect(reminderBanner(page, first.title)).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(reminderBanner(page, second.title)).toBeVisible();
  await reminderBanner(page, second.title).click();
  await page.clock.fastForward(60_000);
  await expect(page.getByRole('button', { name: /^Dismiss reminder / })).toHaveCount(0);
  expect((await readSnapshot(page))?.reminderHistory).toHaveLength(2);
  await reloadDeadlines(page);
  await expect(page.getByRole('button', { name: /^Dismiss reminder / })).toHaveCount(0);
});

test('waits for the app to return to the foreground before showing an elapsed reminder', async ({ page }) => {
  const deadline = makeDeadline('foreground', 'Foreground reminder');
  await openDeadlines(page, [deadline]);
  await setVisibility(page, 'hidden');
  await page.clock.fastForward(120_000);
  await expect(reminderBanner(page, deadline.title)).toHaveCount(0);
  expect((await readSnapshot(page))?.reminderHistory).toHaveLength(0);

  await setVisibility(page, 'visible');
  await page.clock.runFor(1);
  await expect(reminderBanner(page, deadline.title)).toBeVisible();
  expect((await readSnapshot(page))?.reminderHistory).toHaveLength(1);
});

function makeDeadline(id: string, title: string): Deadline {
  return {
    id,
    title,
    notes: '',
    dueAt: '2030-05-06T02:00:00.000Z',
    reminderAt: '2030-05-06T01:01:00.000Z',
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    contentVersion: 1,
    allowAI: false,
  };
}

async function openDeadlines(page: Page, deadlines: Deadline[] = []) {
  await page.clock.install({ time: new Date('2030-05-06T00:59:00.000Z') });
  await page.goto('/');
  await expect(page.getByRole('tab', { name: /Today/ })).toBeVisible();
  await page.clock.pauseAt(new Date(now));
  const data = { ...defaultAppData(), deadlines };
  await page.evaluate(async (snapshot) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('blink-local', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('snapshots', 'readwrite');
        transaction.objectStore('snapshots').put(snapshot, 'app');
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      };
    });
  }, data);
  await reloadDeadlines(page);
  for (const deadline of deadlines) {
    await expect(page.getByRole('button', { name: `Edit deadline ${deadline.title}` })).toBeVisible();
  }
}

async function reloadDeadlines(page: Page) {
  const snapshot = await readSnapshot(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /Deadlines/ }).click();
  await expect(page.getByRole('tab', { name: /Deadlines/ })).toHaveAttribute('aria-selected', 'true');
  for (const deadline of snapshot?.deadlines ?? []) {
    await expect(page.getByRole('button', { name: `Edit deadline ${deadline.title}` })).toBeVisible();
  }
}

async function openCreateDeadline(page: Page, title: string) {
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.clock.runFor(300);
  await page.getByRole('dialog').getByText('DDL', { exact: true }).click();
  await replaceText(page.getByPlaceholder('What is due?'), title, page);
}

async function openEditor(page: Page, title: string) {
  await page.getByRole('button', { name: `Edit deadline ${title}` }).click();
  await page.clock.runFor(300);
  await expect(page.getByRole('dialog')).toBeVisible();
}

async function setCustomReminder(page: Page, date: string, time: string) {
  await page.getByRole('radio', { name: 'Choose date & time', exact: true }).click();
  await replaceText(page.getByLabel('Reminder date', { exact: true }), date, page);
  await replaceText(page.getByLabel('Reminder time', { exact: true }), time, page);
}

async function saveSheet(page: Page, name: 'Save' | 'Done') {
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

function reminderBanner(page: Page, title: string) {
  return page.getByRole('button', { name: `Dismiss reminder ${title}` });
}

async function setVisibility(page: Page, value: DocumentVisibilityState) {
  await page.evaluate((visibility) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: visibility });
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);
}

async function readSnapshot(page: Page): Promise<AppData | null> {
  return page.evaluate(async () => new Promise<AppData | null>((resolve, reject) => {
    const request = indexedDB.open('blink-local', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('snapshots', 'readonly');
      const get = transaction.objectStore('snapshots').get('app');
      get.onsuccess = () => resolve((get.result as AppData | undefined) ?? null);
      get.onerror = () => reject(get.error);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
    };
  }));
}

async function replaceText(locator: Locator, value: string, page: Page) {
  await locator.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.press('Backspace');
  await locator.pressSequentially(value);
}

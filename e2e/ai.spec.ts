import { expect, test, type Page } from '@playwright/test';

const proxyUrl = 'http://127.0.0.1:8787/v1/analyze-icon';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    type BlinkTestGlobal = typeof globalThis & {
      __BLINK_AI_TIMEOUT_MS?: number;
      __readBlinkData?: () => Promise<any>;
      __writeBlinkData?: (data: any) => Promise<void>;
    };
    const target = globalThis as BlinkTestGlobal;
    target.__BLINK_AI_TIMEOUT_MS = 350;
    target.__readBlinkData = async () => new Promise((resolve, reject) => {
      const request = indexedDB.open('blink-local');
      request.onupgradeneeded = () => {
        request.result.createObjectStore('snapshots');
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('snapshots')) {
          resolve(null);
          return;
        }
        const tx = db.transaction('snapshots', 'readonly');
        const get = tx.objectStore('snapshots').get('app');
        get.onerror = () => reject(get.error);
        get.onsuccess = () => resolve(get.result);
      };
    });
    target.__writeBlinkData = async (data) => new Promise((resolve, reject) => {
      const request = indexedDB.open('blink-local');
      request.onupgradeneeded = () => {
        request.result.createObjectStore('snapshots');
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('snapshots', 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore('snapshots').put(data, 'app');
      };
    });
  });
});

test('real AI icon succeeds through the local proxy adapter', async ({ page }) => {
  await enableRealAI(page);
  await page.route(proxyUrl, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ kind: 'icon', version: 1, icon: 'cafe', label: 'Coffee' }),
    });
  });

  const text = `AI success coffee ${Date.now()}`;
  await createNote(page, text);
  await page.getByRole('tab', { name: /Notes/ }).click();
  await expect(page.getByText(text).first()).toBeVisible();
  await expect(page.getByText('Coffee').first()).toBeVisible();
  await expect.poll(() => getLatestJobStatus(page, text)).toBe('completed');
});

test('real AI HTTP failure does not block note save and records retry state', async ({ page }) => {
  await enableRealAI(page);
  await page.route(proxyUrl, async (route) => {
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'mock failure' }) });
  });

  const text = `AI failure note ${Date.now()}`;
  await createNote(page, text);
  await page.getByRole('tab', { name: /Notes/ }).click();
  await expect(page.getByText(text).first()).toBeVisible();
  await expect.poll(() => getLatestJobAttempts(page, text)).toBeGreaterThan(0);
});

test('real AI timeout does not block DDL save', async ({ page }) => {
  await enableRealAI(page);
  await page.route(proxyUrl, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'icon', version: 1, icon: 'flag-outline', label: 'Deadline' }) });
  });

  const text = `AI timeout ddl ${Date.now()}`;
  await createDeadline(page, text);
  await page.getByRole('tab', { name: /Deadlines/ }).click();
  await expect(page.getByText(text).first()).toBeVisible();
  await expect.poll(() => getLatestJobError(page, text)).toContain('timed out');
});

test('real AI offline adapter failure keeps the saved note', async ({ page }) => {
  await enableRealAI(page);
  await page.route(proxyUrl, async (route) => {
    await route.abort('internetdisconnected');
  });

  const text = `AI offline note ${Date.now()}`;
  await createNote(page, text);
  await page.getByRole('tab', { name: /Notes/ }).click();
  await expect(page.getByText(text).first()).toBeVisible();
  await expect.poll(() => getLatestJobAttempts(page, text)).toBeGreaterThan(0);
});

test('logical note generates Mermaid, renders, edits, rejects unsafe source, and survives offline refresh', async ({ page }) => {
  await enableRealAI(page);
  const originalGraph = 'flowchart TD\n  A[Observe state] --> B[Choose action]\n  B --> C[Receive reward]';
  await page.route(proxyUrl, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ kind: 'mermaid', version: 1, definition: originalGraph }),
    });
  });

  const text = `Q-learning observe act reward ${Date.now()}`;
  await createNote(page, text);
  await page.getByRole('tab', { name: /Notes/ }).click();
  await expect(page.getByText(text).first()).toBeVisible();
  await expect.poll(() => getLatestJobStatus(page, text)).toBe('completed');

  await page.getByRole('button', { name: `Open note ${text}` }).click();
  await expect(page.getByTestId('mermaid-graph').first()).toBeVisible();
  await expect(page.locator('svg').first()).toBeVisible();

  const editedGraph = 'flowchart LR\n  A[Draft] --> B[Review]\n  B --> C[Save]';
  await replaceText(page.getByLabel('Mermaid source'), editedGraph, page);
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByTestId('mermaid-graph').nth(1)).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();

  await replaceText(page.getByLabel('Mermaid source'), 'flowchart TD\n  A[Safe] --> B[Unsafe]\n  click A href "https://example.com"', page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Graph not saved|unsupported syntax|Graph unavailable/i).first()).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('mermaid-graph').first()).toBeVisible();
  await expect(page.locator('svg').first()).toBeVisible();

  await page.unroute(proxyUrl);
  await page.route(proxyUrl, async (route) => route.abort('internetdisconnected'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('mermaid-graph').first()).toBeVisible();
});

async function enableRealAI(page: Page) {
  await page.goto('/');
  await page.evaluate(async (url) => {
    const data = await (globalThis as any).__readBlinkData() ?? {
      version: 1,
      notes: [],
      deadlines: [],
      visualAssets: [],
      aiJobs: [],
      aiCache: [],
      settings: {
        aiEnabled: false,
        aiMockMode: true,
        deepSeekModel: 'deepseek-flash',
        hasDeepSeekKey: false,
        aiConsentGranted: false,
        deepSeekProxyUrl: url,
        draftText: '',
        draftMode: 'note',
      },
    };
    data.settings.aiEnabled = true;
    data.settings.aiMockMode = false;
    data.settings.aiConsentGranted = true;
    data.settings.deepSeekProxyUrl = url;
    data.settings.deepSeekModel = 'deepseek-flash';
    await (globalThis as any).__writeBlinkData(data);
  }, proxyUrl);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('tab', { name: /Today/ })).toBeVisible();
}

async function createNote(page: Page, text: string) {
  await page.getByRole('button', { name: 'Create' }).click();
  await replaceText(page.getByPlaceholder('Capture a thought...'), text, page);
  await page.getByRole('button', { name: 'Save' }).click();
}

async function createDeadline(page: Page, text: string) {
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('dialog').getByText('DDL').first().click();
  await replaceText(page.getByPlaceholder('What is due?'), text, page);
  await page.getByRole('button', { name: 'Save' }).click();
}

async function replaceText(locator: ReturnType<Page['getByPlaceholder']>, value: string, page: Page) {
  await locator.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.press('Backspace');
  await locator.pressSequentially(value);
}

async function getLatestJobStatus(page: Page, text: string) {
  return page.evaluate(async (recordText) => {
    const data = await (globalThis as any).__readBlinkData();
    const note = data.notes.find((item: { body: string }) => item.body === recordText);
    const deadline = data.deadlines.find((item: { title: string }) => item.title === recordText);
    const record = note ?? deadline;
    const job = record ? data.aiJobs.find((item: { recordId: string }) => item.recordId === record.id) : null;
    return job?.status ?? null;
  }, text);
}

async function getLatestJobAttempts(page: Page, text: string) {
  return page.evaluate(async (recordText) => {
    const data = await (globalThis as any).__readBlinkData();
    const note = data.notes.find((item: { body: string }) => item.body === recordText);
    const deadline = data.deadlines.find((item: { title: string }) => item.title === recordText);
    const record = note ?? deadline;
    const job = record ? data.aiJobs.find((item: { recordId: string }) => item.recordId === record.id) : null;
    return job?.attempts ?? 0;
  }, text);
}

async function getLatestJobError(page: Page, text: string) {
  return page.evaluate(async (recordText) => {
    const data = await (globalThis as any).__readBlinkData();
    const note = data.notes.find((item: { body: string }) => item.body === recordText);
    const deadline = data.deadlines.find((item: { title: string }) => item.title === recordText);
    const record = note ?? deadline;
    const job = record ? data.aiJobs.find((item: { recordId: string }) => item.recordId === record.id) : null;
    return job?.error ?? '';
  }, text);
}

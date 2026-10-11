import { expect, test, type Locator, type Page } from '@playwright/test';

test('creates note and deadline and keeps them after refresh', async ({ page }) => {
  const suffix = `${Date.now()}`;
  const noteText = `E2E note save ${suffix} #e2e`;
  const editedNoteText = `E2E note edited ${suffix} #e2e`;
  const deletedNoteText = `E2E note delete ${suffix}`;
  const deadlineText = `E2E ddl save ${suffix}`;
  const editedDeadlineText = `E2E ddl edited ${suffix}`;
  const deletedDeadlineText = `E2E ddl delete ${suffix}`;
  const logs: string[] = [];

  page.on('console', (message) => {
    const text = message.text();
    if (text.includes('[Blink save]')) {
      logs.push(text);
    }
  });

  await page.goto('/');
  await expect(page.getByRole('tab', { name: /Today/ })).toBeVisible();

  await page.getByRole('button', { name: 'Create' }).click();
  await replaceText(page.getByPlaceholder('Capture a thought...'), noteText, page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(noteText)).toBeHidden();

  await page.getByRole('tab', { name: /Notes/ }).click();
  await expect(page.getByText(noteText).first()).toBeVisible();
  await expect.poll(() => logs.some((line) => line.includes('note.create.persisted'))).toBe(true);
  await page.getByRole('button', { name: `Edit note ${noteText}` }).click();
  const noteEditor = page.getByRole('dialog').locator('textarea');
  await noteEditor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.press('Backspace');
  await noteEditor.pressSequentially(editedNoteText);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText(editedNoteText).first()).toBeVisible();

  await page.getByRole('button', { name: 'Create' }).click();
  await replaceText(page.getByPlaceholder('Capture a thought...'), deletedNoteText, page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(deletedNoteText).first()).toBeVisible();
  await page.getByRole('button', { name: `Delete note ${deletedNoteText}` }).click();
  await expect(page.getByText(deletedNoteText)).toHaveCount(0);

  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('dialog').getByText('DDL').first().click();
  await replaceText(page.getByPlaceholder('What is due?'), deadlineText, page);
  await page.getByRole('button', { name: 'Save' }).click();

  await page.getByRole('tab', { name: /Deadlines/ }).click();
  await expect(page.getByText(deadlineText).first()).toBeVisible();
  await expect.poll(() => logs.some((line) => line.includes('deadline.create.persisted'))).toBe(true);
  await page.getByRole('button', { name: `Edit deadline ${deadlineText}` }).click();
  const deadlineEditor = page.getByRole('dialog').locator('input').first();
  await deadlineEditor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.press('Backspace');
  await deadlineEditor.pressSequentially(editedDeadlineText);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText(editedDeadlineText).first()).toBeVisible();
  await page.getByRole('checkbox', { name: `Complete deadline ${editedDeadlineText}` }).click();
  await expect(page.getByText(`Completed ${editedDeadlineText}`).first()).toBeVisible();
  await page.getByRole('button', { name: `Undo complete ${editedDeadlineText}` }).click();
  await expect(page.getByRole('checkbox', { name: `Complete deadline ${editedDeadlineText}` })).toBeVisible();

  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('dialog').getByText('DDL').first().click();
  await replaceText(page.getByPlaceholder('What is due?'), deletedDeadlineText, page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(deletedDeadlineText).first()).toBeVisible();
  await page.getByRole('button', { name: `Delete deadline ${deletedDeadlineText}` }).click();
  await expect(page.getByText(deletedDeadlineText)).toHaveCount(0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /Notes/ }).click();
  await expect(page.getByText(editedNoteText).first()).toBeVisible();

  await page.getByRole('tab', { name: /Deadlines/ }).click();
  await expect(page.getByText(editedDeadlineText).first()).toBeVisible();
});

async function replaceText(locator: Locator, value: string, page: Page) {
  await locator.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.press('Backspace');
  await locator.pressSequentially(value);
}

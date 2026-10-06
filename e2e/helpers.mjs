// Shared steps for the P0 browser tests.
import { expect } from '@playwright/test';
import { supabaseUrl } from './settings.mjs';

/** Restores the database to the seeded fixture, so each test starts from the same state. */
export async function resetDatabase() {
  const response = await fetch(supabaseUrl + '/__reset', { method: 'POST' });
  if (!response.ok) throw new Error('Could not restore the test database.');
}

/** Whole-dollar display, as formatMoney shows totals in English (half away from zero). */
export const dollars = amount => (amount < 0 ? '−' : '') + '$' + Math.round(Math.abs(amount)).toLocaleString('en-US');

/** The page's text with animated figures (one digit per line) joined back into one line. */
export async function pageText(page) {
  return (await page.locator('main').innerText()).replace(/\n(?:[$€−,\d%.]\n)+/g, '\n');
}

/** The figure printed right after a label, e.g. "Actual spending" → "$17". */
export async function figureAfter(page, label) {
  const match = (await pageText(page)).match(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n([^\\n]+)'));
  return match?.[1].trim() ?? null;
}

/** Opens a page from the drawer and waits for its title. */
export async function open(page, label) {
  await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click();
  await expect(page).toHaveTitle(`${label} · Hoggish Finance`);
}

/** A cash account's balance as listed on Accounts, or null until it is on screen. Poll it: the page refreshes after a save. */
export async function accountBalance(page, name) {
  return (await pageText(page)).match(new RegExp(`\\n${name}\\nCash account\\n([^\\n]+)`))?.[1] ?? null;
}

/** Chooses the option of a native select whose label contains `text` (labels carry live balances). */
export async function chooseOption(select, text) {
  const value = await select.evaluate((element, wanted) => [...element.options].find(option => option.text.includes(wanted))?.value ?? null, text);
  if (value === null) throw new Error(`No option containing "${text}"`);
  await select.selectOption(value);
}

/** Closes the open dialog, confirming the discard guard when the form has changes. */
export async function closeDialog(page) {
  await page.keyboard.press('Escape');
  const guard = page.getByRole('alertdialog', { name: 'Discard unsaved changes?' });
  if (await guard.isVisible().catch(() => false)) await guard.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

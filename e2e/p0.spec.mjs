// P0 cases from .claude/skills/qa/references/cases.md, run in a browser on the fixed fixture (e2e/fixture.mjs).
// Each test names its catalog cases. Expected figures are worked out from the fixture, never read off the screen.
import { test, expect } from '@playwright/test';
import { accountBalance, chooseOption, closeDialog, dollars, figureAfter, open, pageText, resetDatabase } from './helpers.mjs';
import { expected } from './fixture.mjs';
import { testAccount } from './settings.mjs';

test.beforeEach(async () => { await resetDatabase(); });

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('AUTH-001 AUTH-004 the landing page loads and opens the sample workspace', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Get started' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Explore sample workspace' }).first().click();
    await expect(page.getByText('Demo', { exact: true }).first()).toBeVisible();
    await expect(page).toHaveTitle('Dashboard · Hoggish Finance');
    expect(errors).toEqual([]);
  });

  test('AUTH-028 a Google callback without its verifier asks to start again and signs nobody in', async ({ page }) => {
    await page.goto('/auth/callback?code=abc&redirect_to=https://evil.example');
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByText('Your sign-in attempt expired. Please start again.')).toBeVisible();
  });

  test('sign-in with email and password opens the workspace; the API refuses visitors', async ({ page, request }) => {
    for (const path of ['/api/records', '/api/settings', '/api/deleted-items', '/api/backup']) expect((await request.get(path)).status(), path).toBe(401);
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill(testAccount.email);
    await page.getByLabel('Password', { exact: true }).fill(testAccount.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: /^Welcome( back)?, E2E Tester!$/ })).toBeVisible();
  });
});

test('SHELL-001 every drawer link opens its page with its title', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^Welcome( back)?, E2E Tester!$/ })).toBeVisible();
  for (const label of ['Accounts', 'Transactions', 'Cash flow', 'Reports', 'Budget', 'Recurring', 'Investments', 'Loans & debts', 'Goals', 'Recently deleted', 'Dashboard']) await open(page, label);
});

test('XAPP-001 DASH-013 spending is one figure on the Dashboard, Cash flow, Transactions and Budget', async ({ page }) => {
  const spending = dollars(expected.spendingThisMonth);
  await page.goto('/');
  await expect.poll(() => figureAfter(page, 'Spending')).toBe(`${spending} this month`);
  await open(page, 'Cash flow');
  await expect.poll(() => figureAfter(page, 'Actual spending')).toBe(spending);
  await expect.poll(() => figureAfter(page, 'Income received')).toBe(dollars(expected.incomeThisMonth));
  await open(page, 'Transactions');
  await page.getByLabel('Period').selectOption('this_month');
  await expect.poll(() => figureAfter(page, 'Spending')).toBe(spending);
  await open(page, 'Budget');
  // Total expenses reads Planned, Actual, Remaining.
  await expect.poll(async () => (await pageText(page)).match(/Total expenses\n[^\n]+\n([^\n]+)\n/)?.[1] ?? null).toBe(spending);
});

test('XAPP-003 DASH-001 net worth is the same on the Dashboard and Investments', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => figureAfter(page, 'Net worth')).toMatch(/^\$[\d,]+$/);
  const dashboard = await figureAfter(page, 'Net worth');
  await open(page, 'Investments');
  await expect.poll(() => figureAfter(page, 'Net worth')).toBe(dashboard);
});

test('ACC-001 a new cash account keeps its exact opening balance and adds to USD balances', async ({ page }) => {
  await page.goto('/accounts');
  await expect.poll(() => figureAfter(page, 'USD balances')).toBe(dollars(expected.usdCash));
  await page.getByRole('button', { name: 'Add account' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Cash account/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('E2E Wallet');
  await dialog.getByPlaceholder('0').fill('1250.50');
  await dialog.getByRole('button', { name: 'Save record' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => accountBalance(page, 'E2E Wallet')).toBe('$1,251');
  await expect.poll(() => figureAfter(page, 'USD balances')).toBe(dollars(expected.usdCash + 1250.5));
});

test('ACC-005 XAPP-010 a transfer with a fee moves the money once and counts only the fee as spending', async ({ page }) => {
  await page.goto('/accounts');
  await page.getByRole('button', { name: 'Transfer money' }).click();
  const dialog = page.getByRole('dialog');
  const [from, to] = await dialog.locator('select').all();
  await chooseOption(from, 'E2E Checking');
  await chooseOption(to, 'E2E Savings');
  const [amount, fee] = await dialog.getByPlaceholder('0').all();
  await amount.fill('20');
  await fee.fill('2');
  await expect(dialog.getByText('Net amount received: $18')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => accountBalance(page, 'E2E Checking')).toBe(dollars(expected.checking - 20));
  await expect.poll(() => accountBalance(page, 'E2E Savings')).toBe(dollars(10000 + 18));
  await open(page, 'Cash flow');
  await expect.poll(() => figureAfter(page, 'Actual spending')).toBe(dollars(expected.spendingThisMonth + 2));
});

test('TX-019 TX-020 an expense needs an amount above zero and cannot be dated in the future', async ({ page }) => {
  await page.goto('/transactions');
  await page.getByRole('button', { name: 'Add transaction' }).click();
  await page.getByRole('menuitem', { name: 'Add expense' }).click();
  const dialog = page.getByRole('dialog');
  await chooseOption(dialog.locator('select').filter({ hasText: 'Choose a cash account' }), 'E2E Checking');
  // Typed, as a person would. Clicking Save leaves the field, which shows a zero as its empty placeholder, so the
  // browser's required-field check refuses it before the app's "greater than zero" rule; either way nothing is saved.
  const amount = dialog.getByPlaceholder('0').first();
  await amount.pressSequentially('0');
  const saves = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/records')) saves.push(request.url()); });
  await dialog.getByRole('button', { name: 'Save expense' }).click();
  expect(await amount.evaluate(input => input.validity.valid)).toBe(false);
  await expect(dialog).toBeVisible();
  expect(saves).toEqual([]);
  await dialog.getByRole('button', { name: /\d{4}$/ }).first().click();
  const tomorrow = new Date(Date.now() + 86_400_000 + 5 * 3_600_000).toISOString().slice(0, 10);
  const label = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(tomorrow + 'T00:00:00Z'));
  for (const day of await page.getByRole('button', { name: label, exact: true }).all()) await expect(day).toBeDisabled();
});

test('TX-022 editing an expense moves its account once', async ({ page }) => {
  await page.goto('/transactions');
  await page.getByRole('listitem', { name: /View details for E2E Lunch/ }).getByText('E2E Lunch', { exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('0').first().fill('30');
  await dialog.getByRole('button', { name: /^Save/ }).click();
  await expect(dialog).toBeHidden();
  await open(page, 'Accounts');
  await expect.poll(() => accountBalance(page, 'E2E Checking')).toBe(dollars(expected.checking - (30 - 12.75)));
});

test('TX-024 DEL-004 deleting an expense returns its money and restoring takes it again, exactly once', async ({ page }) => {
  await page.goto('/income-expenses');
  await page.getByRole('navigation', { name: 'Cash flow' }).getByRole('button', { name: 'Transactions' }).click();
  await page.getByRole('button', { name: 'Actions for E2E Lunch' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete record' }).click();
  await open(page, 'Accounts');
  await expect.poll(() => accountBalance(page, 'E2E Checking')).toBe(dollars(expected.checking + 12.75));
  await open(page, 'Recently deleted');
  await page.getByRole('button', { name: 'Restore' }).first().click();
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.locator('main').getByText('E2E Lunch')).toHaveCount(0);
  await open(page, 'Accounts');
  await expect.poll(() => accountBalance(page, 'E2E Checking')).toBe(dollars(expected.checking));
});

test('CF-040 Recent transactions lists the expense saved last first', async ({ page }) => {
  await page.goto('/income-expenses');
  const rows = page.locator('section', { has: page.getByRole('heading', { name: /^Recent transactions/ }) }).locator('tbody tr');
  await expect(rows.first()).toContainText('E2E Lunch');
  await expect(rows.nth(1)).toContainText('E2E Coffee');
});

test('REC-027 REC-003 a schedule started two years back is not overdue, and paying it from an empty account is refused', async ({ page }) => {
  await page.goto('/upcoming');
  await expect(page.getByText('E2E Gym').first()).toBeVisible();
  await expect(page.getByText('Open from earlier months')).toHaveCount(0);
  await expect(page.getByRole('navigation').getByRole('link', { name: /^Recurring\s*\d/ })).toHaveCount(0);
  const row = page.locator('li', { hasText: 'E2E Gym' }).first();
  await row.getByRole('button', { name: 'Record payment' }).click();
  const dialog = page.getByRole('dialog');
  await chooseOption(dialog.locator('select').first(), 'E2E Empty');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Insufficient balance or invalid amount.').first()).toBeVisible();
  await closeDialog(page);
  await open(page, 'Accounts');
  await expect.poll(() => accountBalance(page, 'E2E Empty')).toBe('$0');
});

test('LOAN-004 LOAN-012 a loan repayment moves loan and cash together, and deleting it puts both back', async ({ page }) => {
  await page.goto('/loans-debts');
  await page.getByRole('row', { name: /E2E Car loan/ }).getByRole('button', { name: 'Record payment' }).click();
  const dialog = page.getByRole('dialog');
  await chooseOption(dialog.locator('select').nth(1), 'E2E Checking');
  await dialog.getByPlaceholder('0').first().fill('50');
  await expect(dialog.getByText('Outstanding balance after update: $4,950')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save update' }).click();
  await expect(dialog.getByText('Cash deducted from E2E Checking: $50')).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete update' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete update' }).click();
  await expect(dialog.getByText('Cash deducted from E2E Checking: $50')).toBeHidden();
  await dialog.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await pageText(page)).includes('$5,000')).toBe(true);
  await open(page, 'Accounts');
  await expect.poll(() => accountBalance(page, 'E2E Checking')).toBe(dollars(expected.checking));
});

test('INV-003 selling part of a holding adds the proceeds to cash and keeps the rest', async ({ page }) => {
  await page.goto('/accounts');
  await page.getByRole('button', { name: 'Account actions: AAPL' }).click();
  await page.getByRole('menuitem', { name: 'Sell / convert' }).click();
  const dialog = page.getByRole('dialog');
  await chooseOption(dialog.locator('select').nth(1), 'E2E Checking');
  const [quantity, proceeds] = await dialog.getByPlaceholder('0').all();
  await quantity.fill('1');
  await proceeds.fill('250');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => accountBalance(page, 'E2E Checking')).toBe(dollars(expected.checking + 250));
  await expect.poll(async () => /AAPL\n\n?1 unit/.test(await pageText(page))).toBe(true);
});

// Project-wide guard for the formatting rule in AGENTS.md: every date a person reads is written by the
// shared date formatter ("30 September 2026", never "2026-09-30"), and every amount, price, quantity or
// rate by the shared number formatters in lib/format.ts. Only lib/format.ts and lib/pos-date-format.js format.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const roots = ['app', 'components', 'hooks', 'lib', 'worker'];
const formatters = new Set(['lib/format.ts', 'lib/pos-date-format.js']);
const sources = roots.flatMap(function walk(dir) {
 if (!fs.existsSync(dir)) return [];
 return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const file = path.posix.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'locales' ? [] : walk(file);
  return /\.(ts|tsx|js|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [file] : [];
 });
});
const read = file => fs.readFileSync(file, 'utf8');
const isoDay = /\d{4}-\d{2}-\d{2}/, numericDay = /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/;

test('only the shared formatters turn numbers and dates into text', () => {
 assert.ok(sources.length > 100, 'the scan found the sources');
 const offenders = sources.filter(file => !formatters.has(file)).flatMap(file => {
  // Intl.DisplayNames names currencies and countries; it formats no number or date.
  const source = read(file).replace(/new Intl\.DisplayNames\b/g, '');
  return /new Intl\.|Intl\.(NumberFormat|DateTimeFormat)|\.toLocale(Date|Time)?String\(|\.toFixed\(/.test(source) ? [file] : [];
 });
 assert.deepEqual(offenders, [], 'use formatMoney, formatNumber, formatPercent, formatDate or formatDateTime from lib/format.ts');
});

test('no translated text or interface string spells out a date or an example amount in raw numbers', () => {
 for (const file of fs.readdirSync('lib/locales')) {
  const dictionary = JSON.parse(read('lib/locales/' + file));
  for (const [key, value] of Object.entries(dictionary)) {
   for (const text of [key, value]) assert.ok(!isoDay.test(text) && !numericDay.test(text), `${file}: "${text}" — pass the date as a {placeholder} filled by formatDate`);
   // Example amounts and percentages are placeholders too, filled by formatNumber, formatMoney or formatPercent.
   for (const text of [key, value]) assert.ok(!/\d{4,}|\d[.,]\d|\d\s?[%٪]|[%٪]\s?\d/.test(text), `${file}: "${text}" — pass the number as a {placeholder} filled by a shared formatter`);
  }
 }
 for (const file of sources) {
  const source = read(file);
  // A literal date inside a translated string, or in text a component renders.
  for (const match of source.matchAll(/\bt\(\s*(?:[a-z]+\s*,\s*)?(['"`])((?:(?!\1).)*)\1/g)) assert.ok(!isoDay.test(match[2]) && !numericDay.test(match[2]), `${file}: t('${match[2]}')`);
  if (file.endsWith('.tsx')) for (const match of source.matchAll(/>([^<>{}]*)</g)) assert.ok(!isoDay.test(match[1]), `${file}: >${match[1]}<`);
 }
});

test('the date formatter writes the day, the month name and the year', async () => {
 const { formatDate } = await import('../lib/pos-date-format.js').then(({ formatLongDate }) => ({ formatDate: (value, locale) => formatLongDate(value, locale, '—') }));
 assert.equal(formatDate('2026-09-30', 'en'), '30 September 2026');
 assert.equal(formatDate('2026-09-30', 'ru'), '30 сентября 2026');
 assert.equal(formatDate('2026-09-30', 'uz'), '30 sentabr 2026');
});

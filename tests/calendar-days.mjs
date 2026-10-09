import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as days from '../lib/calendar-days.ts';
import { depositToday } from '../lib/deposit-interest.ts';

const { dayMs, dayTime, isoDay, shiftDay, daysBetween, shiftMonth, addMonths, monthEnd, monthDays } = days;

test('days move by whole calendar days across months, years and leap days', () => {
 assert.equal(dayMs, 86400000);
 assert.equal(dayTime('2026-09-30'), Date.UTC(2026, 8, 30));
 assert.equal(isoDay(Date.UTC(2026, 8, 30, 23, 59)), '2026-09-30');
 assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
 assert.equal(shiftDay('2027-01-01', -1), '2026-12-31');
 assert.equal(shiftDay('2028-02-28', 1), '2028-02-29');
 assert.equal(shiftDay('2027-02-28', 1), '2027-03-01');
 assert.equal(shiftDay('2026-03-01', -30), '2026-01-30');
 assert.equal(shiftDay('2026-03-29', 0), '2026-03-29');
 // A European daylight-saving change day is still one calendar day long.
 assert.equal(shiftDay('2026-03-28', 2), '2026-03-30');
 assert.throws(() => shiftDay('not a day', 1));
});

test('day differences are whole days and signed', () => {
 assert.equal(daysBetween('2026-09-30', '2026-10-01'), 1);
 assert.equal(daysBetween('2026-10-01', '2026-09-30'), -1);
 assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
 assert.equal(daysBetween('2028-01-01', '2029-01-01'), 366);
 assert.equal(daysBetween('2027-01-01', '2028-01-01'), 365);
 assert.equal(daysBetween('2026-10-04', '2026-10-04'), 0);
 assert.ok(Number.isNaN(daysBetween('2026-10-04', '')));
});

test('months shift across year boundaries in both directions', () => {
 assert.equal(shiftMonth('2026-12', 1), '2027-01');
 assert.equal(shiftMonth('2026-01', -1), '2025-12');
 assert.equal(shiftMonth('2026-03', -14), '2025-01');
 assert.equal(shiftMonth('2026-10', 24), '2028-10');
 assert.equal(shiftMonth('2026-10', 0), '2026-10');
});

test('a day moved by months is clamped to the end of a shorter month', () => {
 assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
 assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
 assert.equal(addMonths('2026-01-31', 2), '2026-03-31');
 assert.equal(addMonths('2026-03-31', -1), '2026-02-28');
 assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
 assert.equal(addMonths('2027-01-15', -1), '2026-12-15');
 assert.equal(addMonths('2028-02-29', 12), '2029-02-28');
 assert.equal(addMonths('2026-10-04', 0), '2026-10-04');
});

test('goal pages take day arithmetic from calendar-days: the goal date cap is a hundred years on the same calendar', async () => {
 const fs = await import('node:fs');
 // 29 February 2000 + 100 years is 28 February 2100 (not a leap year); local-time Date arithmetic rolled it to 1 March.
 assert.equal(addMonths('2000-02-29', 1200), '2100-02-28');
 assert.equal(addMonths('2026-10-09', 1200), '2126-10-09');
 const source = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
 assert.match(source('components/planning/goals-page.tsx'), /const maxDate=addMonths\(today,1200\);/);
 for (const file of ['components/planning/goal-forecast.tsx', 'components/planning/investment-goal-plan.tsx', 'components/planning/goals-page.tsx']) {
  assert.doesNotMatch(source(file), /toISOString\(\)\.slice\(0, ?10\)|getFullYear\(\)\+100/, file);
 }
});

test('month ends and lengths follow leap years', () => {
 assert.equal(monthEnd('2026-01'), '2026-01-31');
 assert.equal(monthEnd('2026-02'), '2026-02-28');
 assert.equal(monthEnd('2028-02'), '2028-02-29');
 assert.equal(monthEnd('2100-02'), '2100-02-28');
 assert.equal(monthEnd('2000-02'), '2000-02-29');
 assert.equal(monthEnd('2026-12'), '2026-12-31');
 assert.equal(monthDays('2026-04'), 30);
 assert.equal(monthDays('2028-02'), 29);
});

test('the app day is the Asia/Tashkent calendar day', () => {
 assert.equal(depositToday(new Date('2026-09-30T18:59:59Z')), '2026-09-30');
 assert.equal(depositToday(new Date('2026-09-30T19:00:00Z')), '2026-10-01');
 assert.equal(depositToday(new Date('2026-12-31T19:30:00Z')), '2027-01-01');
});

test('results do not depend on the runtime timezone', () => {
 const script = `import * as d from ${JSON.stringify(new URL('../lib/calendar-days.ts', import.meta.url).href)};
 import { depositToday } from ${JSON.stringify(new URL('../lib/deposit-interest.ts', import.meta.url).href)};
 console.log(JSON.stringify([d.shiftDay('2026-03-28', 2), d.shiftDay('2026-11-01', -1), d.daysBetween('2026-03-01', '2026-11-30'), d.shiftMonth('2026-01', -1), d.addMonths('2026-01-31', 1), d.monthEnd('2028-02'), depositToday(new Date('2026-09-30T19:00:00Z')), new Date().getTimezoneOffset() !== 0 || process.env.TZ === 'UTC']));`;
 const results = ['UTC', 'America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'].map(TZ => {
  const run = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8', cwd: fileURLToPath(new URL('..', import.meta.url)) });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
 });
 for (const result of results) assert.deepEqual(result, ['2026-03-30', '2026-10-31', 274, '2025-12', '2026-02-28', '2028-02-29', '2026-10-01', true]);
});

test('no screen dates "today" by the UTC day instead of the app day', async () => {
 const { readdirSync, readFileSync, statSync } = await import('node:fs');
 const root = fileURLToPath(new URL('..', import.meta.url));
 const sources = dir => readdirSync(root + dir).flatMap(name => { const path = dir + '/' + name; return statSync(root + path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : []; });
 const utcToday = /new Date\(\)\.toISOString\(\)\.slice\(0, ?(?:7|10)\)/;
 assert.deepEqual(['app', 'components', 'hooks', 'lib'].flatMap(sources).filter(path => utcToday.test(readFileSync(root + path, 'utf8'))), []);
 assert.match(readFileSync(root + 'components/tax-prep-sheet.tsx', 'utf8'), /generated: formatDate\(depositToday\(\), locale\)/);
});

test('day and month arithmetic and "today" come from the shared helpers, never inline UTC or +5h maths',async()=>{
 const fs=await import('node:fs');
 for(const file of ['components/auth-showcase.tsx','components/reminder-panel.tsx','components/planning/debt-payoff-panel.tsx']){
  const source=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(source,/Date\.UTC\(|86400000|5 \* 60 \* 60 \* 1000|getUTCDate\(\)/,file);
 }
 assert.match(fs.readFileSync('lib/deposit-interest.ts','utf8'),/depositMonth = \(now = new Date\(\)\) => depositToday\(now\)\.slice\(0, 7\)/);
});

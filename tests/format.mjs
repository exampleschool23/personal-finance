import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNumberInput, numberInputValue, formatMoney, formatDate, formatDateTime } from '../lib/format.ts';
test('amount entry groups digits and round-trips supported locales',()=>{
 for(const locale of ['en-US','ru-RU','uz-UZ']) {
  const formatted=numberInputValue(9300.25,locale);
  assert.equal(formatNumberInput(formatted,locale).value,9300.25);
  assert.equal(formatNumberInput('9300',locale).text,numberInputValue(9300,locale));
 }
 assert.equal(formatNumberInput('9300.00','en-US').text,'9,300.00');
 assert.equal(formatNumberInput('9300.','en-US').text,'9,300.');
 assert.equal(formatNumberInput('','en-US').value,null);
 assert.equal(formatNumberInput('abc','en-US'),null);
 assert.equal(formatNumberInput('1.2.3','en-US'),null);
});
test('money preserves unit-price precision and uses currency formatting',()=>{
 assert.equal(formatMoney(9300,'USD','en-US'),'$9,300.00');
 assert.equal(formatMoney(0.00001234,'USD','en-US',true),'$0.00001234');
 assert.equal(formatMoney(NaN,'USD','en-US'),'—');
});
test('dates validate calendar days and handle empty values',()=>{
 assert.equal(formatDate('2026-09-16','en-US'),'16 September 2026');
 assert.equal(formatDate('2026-09-16','ru-RU'),'16 сентября 2026');
 assert.equal(formatDate('','en-US'),'—');
 assert.equal(formatDate('2026-02-30','en-US'),'—');
 assert.equal(formatDateTime('invalid','en-US'),'—');
});

test('calendar dates round-trip without timezone shifts',async()=>{
 const {parseCalendarDate,calendarIso,formatMonthYear}=await import('../lib/format.ts');
 for(const value of ['2026-09-16','2024-02-29','2026-12-31']) assert.equal(calendarIso(parseCalendarDate(value)),value);
 assert.equal(parseCalendarDate('2026-02-29'),undefined);
 assert.equal(parseCalendarDate(''),undefined);
 assert.equal(formatMonthYear('2026-09-01','en-US'),'September 2026');
});

test('matches POS translated dates and Tashkent timestamp rules',()=>{
 assert.equal(formatDate('2026-09-16','uz-UZ'),'16 sentabr 2026');
 assert.equal(formatDateTime('2026-09-15T20:30:00Z','en-US'),'16 September 2026 01:30');
 assert.equal(formatDateTime('2026-09-16 09:30:00','ru-RU'),'16 сентября 2026 09:30');
});

test('year labels do not contain numeric grouping separators', async () => {
 const { formatYear } = await import('../lib/format.ts');
 for (const locale of ['en-US','ru-RU','uz-UZ']) assert.equal(formatYear(2026, locale), '2026');
});

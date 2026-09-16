import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRangeCalendar, shiftCalendarMonth } from '../lib/date-picker-calendar.ts';
test('POS calendar grid starts Monday and always has six weeks',()=>{
 const days=buildRangeCalendar('2026-09');
 assert.equal(days.length,42);assert.equal(days[0].date,'2026-08-31');
 assert.equal(days.filter(d=>d.inMonth).length,30);
 assert.equal(days.at(-1).date,'2026-10-11');
});
test('POS navigation crosses years and supports leap months',()=>{
 assert.equal(shiftCalendarMonth('2026-12',1),'2027-01');
 assert.equal(shiftCalendarMonth('2026-01',-1),'2025-12');
 assert.equal(buildRangeCalendar('2024-02').filter(d=>d.inMonth).length,29);
});

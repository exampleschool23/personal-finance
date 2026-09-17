import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRangeCalendar, shiftCalendarMonth, calendarYearAnchor } from '../lib/date-picker-calendar.ts';
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

test('year selection keeps either panel aligned across December and leap years',()=>{
 assert.equal(calendarYearAnchor('2026-09',2034,0),'2034-09');
 assert.equal(calendarYearAnchor('2027-01',2034,1),'2033-12');
 assert.equal(calendarYearAnchor('2026-02',2024,1),'2024-01');
 assert.equal(buildRangeCalendar(shiftCalendarMonth(calendarYearAnchor('2026-02',2024,1),1)).filter(d=>d.inMonth).length,29);
});

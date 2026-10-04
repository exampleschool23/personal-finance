import fs from 'node:fs';import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { buildRangeCalendar, shiftCalendarMonth, calendarYearAnchor, openingCalendarDay, presetDay, availablePresets, defaultDatePresets, pastDatePresets, datePresetLabels } = loadTS('lib/date-picker-calendar.ts');
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
test('an empty picker opens on today within its limits, not on a distant minimum',()=>{
 assert.equal(openingCalendarDay('','2026-09-30','2016-01-01','2026-09-30'),'2026-09-30');
 assert.equal(openingCalendarDay('2026-09-15','2026-09-30','2016-01-01'),'2026-09-15');
 assert.equal(openingCalendarDay('','2026-09-30','2026-10-05'),'2026-10-05');
 assert.equal(openingCalendarDay('','2026-09-30',undefined,'2026-06-01'),'2026-06-01');
});

test('presets resolve on the calendar and drop days outside the allowed range',()=>{
 assert.equal(presetDay('today','2026-12-31'),'2026-12-31');
 assert.equal(presetDay('tomorrow','2026-12-31'),'2027-01-01');
 assert.equal(presetDay('week','2024-02-26'),'2024-03-04');
 assert.equal(presetDay('month_start','2026-10-02'),'2026-10-01');
 assert.equal(presetDay('year_start','2026-10-02'),'2026-01-01');
 // A future-only picker (a goal date after today) never offers Today.
 assert.deepEqual(availablePresets(defaultDatePresets,'2026-10-02','2026-10-03').map(item=>item.preset),['tomorrow','week']);
 // A start date in the past offers starts of the month and year, never future days.
 assert.deepEqual(availablePresets(pastDatePresets,'2026-10-02','2016-01-01','2026-10-02'),[{preset:'today',date:'2026-10-02'},{preset:'month_start',date:'2026-10-01'},{preset:'year_start',date:'2026-01-01'}]);
 assert.deepEqual(availablePresets(defaultDatePresets,'2026-10-02',undefined,'2026-10-02').map(item=>item.preset),['today']);
 assert.deepEqual(availablePresets(pastDatePresets,'2026-01-01').map(item=>item.preset),['today'],'the same day is offered once');
 for(const preset of [...defaultDatePresets,...pastDatePresets])assert.ok(datePresetLabels[preset]);
});

test('month arrows stop at the minimum and maximum months, so the picker never pages into days it cannot select',()=>{
 const source=fs.readFileSync(new URL('../components/presentation-foundation/date-picker.tsx',import.meta.url),'utf8');
 assert.match(source,/disabled=\{!!min && monthKey <= min\.slice\(0, 7\)\} onClick=\{previous\}/);
 assert.match(source,/disabled=\{!!max && monthKey >= max\.slice\(0, 7\)\} onClick=\{next\}/);
});

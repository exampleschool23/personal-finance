import test from 'node:test';
import assert from 'node:assert/strict';
import * as dates from '../lib/pos-date-format.js';

test('instants parse numbers, dates and strings, assuming Tashkent time when no zone is given',()=>{
 const {parseInstantDate,parseDisplayDate}=dates;
 for(const value of [null,undefined,''])assert.equal(parseInstantDate(value),null);
 assert.equal(parseInstantDate(0).toISOString(),'1970-01-01T00:00:00.000Z');
 assert.equal(parseInstantDate(Number.NaN),null);
 const date=new Date('2026-09-30T10:00:00Z');assert.equal(parseInstantDate(date),date);
 assert.equal(parseInstantDate(new Date('nope')),null);
 assert.equal(parseInstantDate('2026-09-30').toISOString(),'2026-09-29T19:00:00.000Z');
 assert.equal(parseInstantDate('2026-09-30 12:30').toISOString(),'2026-09-30T07:30:00.000Z');
 assert.equal(parseInstantDate('2026-09-30T12:30:15.5').toISOString(),'2026-09-30T07:30:15.500Z');
 assert.equal(parseInstantDate('2026-09-30T12:30:00Z').toISOString(),'2026-09-30T12:30:00.000Z');
 assert.equal(parseInstantDate('2026-09-30T12:30:00+0300').toISOString(),'2026-09-30T09:30:00.000Z');
 assert.equal(parseInstantDate('   '),null);
 assert.equal(parseInstantDate('not a date'),null);
 assert.equal(parseDisplayDate(''),null);
 assert.equal(parseDisplayDate('2026-09-30',{dateOnly:true}).toISOString(),'2026-09-29T19:00:00.000Z');
 assert.equal(parseDisplayDate('2026-09-30T00:00:00Z').toISOString(),'2026-09-30T00:00:00.000Z');
 assert.deepEqual([dates.RESTAURANT_TIME_ZONE,dates.RESTAURANT_UTC_OFFSET,dates.RESTAURANT_UTC_OFFSET_MINUTES],['Asia/Tashkent','+05:00',300]);
});

test('elapsed time is whole minutes, never negative, with replaceable labels',()=>{
 const now=Date.parse('2026-09-30T12:00:00Z');
 assert.equal(dates.elapsedMinutesSince('2026-09-30T11:00:30Z',now),59);
 assert.equal(dates.elapsedMinutesSince('2026-09-30T13:00:00Z',now),0);
 assert.equal(dates.elapsedMinutesSince('2026-09-30T11:00:00Z','2026-09-30T12:00:00Z'),60);
 assert.equal(dates.elapsedMinutesSince('bad',now),null);
 assert.equal(dates.elapsedMinutesSince('2026-09-30T11:00:00Z','bad'),null);
 assert.equal(dates.formatElapsedSince('2026-09-30T11:59:30Z',{now}),'< 1 min');
 assert.equal(dates.formatElapsedSince('2026-09-30T11:45:00Z',{now}),'15 min');
 assert.equal(dates.formatElapsedSince('2026-09-30T09:55:00Z',{now}),'2h 5m');
 assert.equal(dates.formatElapsedSince(null,{now}),null);
 assert.equal(dates.formatElapsedSince('2026-09-30T11:59:59Z',{now,lessThanMinute:n=>`now (${n})`}),'now (0)');
 assert.equal(dates.formatElapsedSince('2026-09-30T11:00:00Z',{now,hoursMinutes:'over an hour'}),'over an hour');
 assert.ok(dates.formatElapsedSince(new Date(Date.now()-120000))?.endsWith('min'));
});

test('date-only values keep their calendar day and missing ones use the fallback',()=>{
 assert.equal(dates.formatDateOnly('2026-09-30'),'30.09.2026');
 assert.equal(dates.formatDateOnly('2026-01-05T23:30:00Z'),'06.01.2026');
 assert.equal(dates.formatDateOnly(null),'');
 assert.equal(dates.formatDateOnly('bad','—'),'—');
 assert.equal(dates.formatTime('2026-09-30T04:05:00Z'),'09:05');
 assert.equal(dates.formatTime(undefined,'—'),'—');
 assert.equal(dates.formatDateTime('2026-09-30T20:15:00Z'),'01.10.2026 01:15');
 assert.equal(dates.formatDateTime('',''),'');
});

test('language codes normalise to a supported table, else English',()=>{
 assert.equal(dates.normalizeDateLang('pt-BR'),'pt');
 assert.equal(dates.normalizeDateLang('ES_mx'),'es');
 assert.equal(dates.normalizeDateLang('fil'),'fil');
 assert.equal(dates.normalizeDateLang('xx'),'en');
 assert.equal(dates.normalizeDateLang(null),'en');
 assert.equal(dates.normalizeDateLang(),'en');
 assert.deepEqual(dates.weekdayLabels(),['Mon','Tue','Wed','Thu','Fri','Sat','Sun']);
 assert.deepEqual(dates.weekdayLabels('ru').slice(0,2),['Пн','Вт']);
 assert.equal(dates.weekdayLabels('zz')[6],'Sun');
});

test('long dates follow each language pattern, with and without the year',()=>{
 const cases={
  en:['30 September 2026','30 September'],ru:['30 сентября 2026','30 сентября'],uz:['30 sentabr 2026','30 sentabr'],
  es:['30 de septiembre de 2026','30 de septiembre'],pt:['30 de setembro de 2026','30 de setembro'],
  zh:['2026年9月30日','9月30日'],ja:['2026年9月30日','9月30日'],ko:['2026년 9월 30일','9월 30일'],
  vi:['30 tháng 9 năm 2026','30 tháng 9'],de:['30. September 2026','30. September'],cs:['30. září 2026','30. září'],
  he:['30 בספטמבר 2026','30 בספטמבר'],pl:['30 września 2026','30 września'],fr:['30 septembre 2026','30 septembre'],
 };
 for(const [lang,[full,short]] of Object.entries(cases)){
  assert.equal(dates.formatLongDate('2026-09-30',lang),full,lang);
  assert.equal(dates.formatLongDate('2026-09-30',lang,'',{includeYear:false}),short,lang);
 }
 assert.equal(dates.formatLongDate('2026-09-30'),'30 September 2026');
 assert.equal(dates.formatLongDate(null,'en','—'),'—');
 assert.equal(dates.formatLongDate('2026-09-30','xx'),'30 September 2026');
});

test('month titles use the translated title tables and patterns',()=>{
 const cases={en:'September 2026',ru:'Сентябрь 2026',uz:'Sentabr 2026',es:'Septiembre de 2026',pt:'Setembro de 2026',zh:'2026年9月',ja:'2026年9月',ko:'2026년 9월',vi:'Tháng 9 năm 2026',it:'Settembre 2026',pl:'Wrzesień 2026',nl:'September 2026'};
 for(const [lang,expected] of Object.entries(cases))assert.equal(dates.formatMonthYear('2026-09',lang),expected,lang);
 assert.equal(dates.formatMonthYear('2026-09-30'),'September 2026');
 assert.equal(dates.formatMonthYear('',undefined,'—'),'—');
 assert.equal(dates.formatMonthYear(null),'');
});

test('long date-times add the Tashkent 24-hour time',()=>{
 assert.equal(dates.formatLongDateTime('2026-09-30T13:05:00Z'),'30 September 2026 18:05');
 assert.equal(dates.formatLongDateTime('2026-09-30T20:05:00Z','ru'),'1 октября 2026 01:05');
 assert.equal(dates.formatLongDateTime('2026-09-30T13:05:00Z','en','',{includeYear:false}),'30 September 18:05');
 assert.equal(dates.formatLongDateTime('bad','en','—'),'—');
});

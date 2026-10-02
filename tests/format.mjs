import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNumberInput, numberInputValue, formatMoney, formatAccountOption, formatSignedMoney, formatCompactMoney, formatDate, formatDateTime, formatMonthYear, formatPercent } from '../lib/format.ts';
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
 assert.equal(formatMoney(9300,'USD','en-US'),'$9,300');
 assert.equal(formatMoney(0.00001234,'USD','en-US',true),'$0.00001234');
 assert.equal(formatMoney(NaN,'USD','en-US'),'—');
});
test('balances display whole amounts across languages without changing input precision',()=>{
 const expected={
  'en-US':['$9,300','$3,174','$0.00001234'],
  'ru-RU':['9\u00a0300\u00a0$','3\u00a0174\u00a0$','0,00001234\u00a0$'],
  'uz-UZ':['9\u00a0300\u00a0US$','3\u00a0174\u00a0US$','0,00001234\u00a0US$'],
 };
 for(const [locale,[whole,rounded,smallQuote]] of Object.entries(expected)){
  assert.equal(formatMoney(9300,'USD',locale),whole);
  assert.equal(formatMoney(9300,'USD',locale,true),whole);
  assert.equal(formatMoney(3173.82,'USD',locale),rounded);
  assert.equal(formatMoney(.00001234,'USD',locale,true),smallQuote);
  assert.equal(formatNumberInput(numberInputValue(3173.82,locale),locale).value,3173.82);
 }
 assert.equal(formatMoney(310894.33,'USD','en-US'),'$310,894');
 assert.equal(formatMoney(-3173.82,'USD','en-US'),'-$3,174');
 assert.equal(formatMoney(-.2,'USD','en-US'),'$0');
 assert.equal(formatMoney(Infinity,'USD','en-US'),'—');
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

test('planner input display hides calculated decimal tails without changing precision', () => {
 const calculated = 13782.113487716848;
 for (const locale of ['en-US', 'ru-RU', 'uz-UZ']) {
  assert.equal(numberInputValue(calculated, locale, 0), numberInputValue(13782, locale));
  assert.equal(numberInputValue(3173.82, locale, 0), numberInputValue(3174, locale));
  assert.equal(numberInputValue(0, locale, 0), '0');
  assert.equal(formatNumberInput(numberInputValue(calculated, locale), locale).value, calculated);
  assert.equal(formatNumberInput(numberInputValue(0.00001234, locale), locale).value, 0.00001234);
  assert.equal(formatNumberInput(numberInputValue(123.45, locale), locale).value, 123.45);
 }
});
test('compact money shortens chart axis labels in every supported language',()=>{
 assert.equal(formatCompactMoney(4000000,'USD','en-US'),'$4M');
 assert.equal(formatCompactMoney(1500,'USD','en-US'),'$1.5K');
 assert.equal(formatCompactMoney(0,'USD','en-US'),'$0');
 // Day totals and rows share one signed format with a true minus sign.
 assert.equal(formatSignedMoney(-13,'USD','en-US'),'\u2212$13');
 assert.equal(formatSignedMoney(1200.4,'USD','en-US'),'+$1,200');
 assert.equal(formatSignedMoney(-0.2,'USD','en-US'),'$0');
 assert.equal(formatSignedMoney(NaN,'USD','en-US'),'—');
 for(const locale of ['ru-RU','uz-UZ'])assert.ok(formatSignedMoney(-13,'USD',locale).startsWith('\u2212')&&!formatSignedMoney(-13,'USD',locale).includes('-'));
 // Small compact labels are whole amounts, never a calculation tail such as $12.8.
 assert.equal(formatCompactMoney(12.8,'USD','en-US'),'$13');
 assert.equal(formatCompactMoney(999.4,'USD','en-US'),'$999');
 assert.equal(formatCompactMoney(2480,'USD','en-US'),'$2.5K');
 for(const locale of ['ru-RU','uz-UZ'])assert.ok(!/[.,]\d/.test(formatCompactMoney(12.8,'USD',locale)));
 assert.equal(formatCompactMoney(NaN,'USD','en-US'),'—');
 for(const locale of ['ru-RU','uz-UZ'])assert.ok(formatCompactMoney(25000000,'UZS',locale).startsWith('25'));
});
test('percentages use the locale digits, one decimal by default, and a dash for unknown values',()=>{
 assert.equal(formatPercent(12.345,'en-US'),'12.3%');
 assert.equal(formatPercent(12.345,'ru-RU'),'12,3%');
 assert.equal(formatPercent(1234.5,'uz-UZ'),'1 234,5%');
 assert.equal(formatPercent(8,'en-US',2),'8%');
 assert.equal(formatPercent(-3.14159,'en-US',2),'-3.14%');
 assert.equal(formatPercent(NaN,'en-US'),'—');
 assert.equal(formatPercent(Infinity,'en-US'),'—');
});

const formatLocales = {
  'es-ES': ['16 de septiembre de 2026', 'Septiembre de 2026'],
  'es-MX': ['16 de septiembre de 2026', 'Septiembre de 2026'],
  'pt-BR': ['16 de setembro de 2026', 'Setembro de 2026'],
  'fr-FR': ['16 septembre 2026', 'Septembre 2026'],
  'ar-AE': ['16 سبتمبر 2026', 'سبتمبر 2026'],
  'ur-PK': ['16 ستمبر 2026', 'ستمبر 2026'],
  'hi-IN': ['16 सितंबर 2026', 'सितंबर 2026'],
  'bn-BD-u-nu-latn': ['16 সেপ্টেম্বর 2026', 'সেপ্টেম্বর 2026'],
  'zh-CN': ['2026年9月16日', '2026年9月'],
  'ja-JP': ['2026年9月16日', '2026年9月'],
  'ko-KR': ['2026년 9월 16일', '2026년 9월'],
  'th-TH-u-nu-latn-ca-gregory': ['16 กันยายน 2026', 'กันยายน 2026'],
  'vi-VN': ['16 tháng 9 năm 2026', 'Tháng 9 năm 2026'],
  'de-DE': ['16. September 2026', 'September 2026'],
  'it-IT': ['16 settembre 2026', 'Settembre 2026'],
  'tr-TR': ['16 Eylül 2026', 'Eylül 2026'],
  'id-ID': ['16 September 2026', 'September 2026'],
  'ms-MY': ['16 September 2026', 'September 2026'],
  'pl-PL': ['16 września 2026', 'Wrzesień 2026'],
  'uk-UA': ['16 вересня 2026', 'Вересень 2026'],
  'nl-NL': ['16 september 2026', 'September 2026'],
  'cs-CZ': ['16. září 2026', 'Září 2026'],
  'ro-RO': ['16 septembrie 2026', 'Septembrie 2026'],
  'fa-IR-u-nu-latn': ['16 سپتامبر 2026', 'سپتامبر 2026'],
  'he-IL': ['16 בספטמבר 2026', 'ספטמבר 2026'],
  'fil-PH': ['16 Setyembre 2026', 'Setyembre 2026'],
  'sw-KE': ['16 Septemba 2026', 'Septemba 2026'],
};
test('dates read naturally in every offered language, stay on their calendar day and never depend on the timezone', () => {
  for (const [locale, [day, month]] of Object.entries(formatLocales)) {
    assert.equal(formatDate('2026-09-16', locale), day, locale);
    assert.equal(formatMonthYear('2026-09', locale), month, locale);
    assert.equal(formatDate('', locale), '—', locale);
    assert.equal(formatDate('2026-02-30', locale), '—', locale);
    // A late-evening UTC instant is already the next day in Asia/Tashkent, exactly as in English.
    assert.equal(formatDateTime('2026-09-15T20:30:00Z', locale), day + ' 01:30', locale);
  }
});
test('amounts keep whole numbers, grouping and Latin digits in every offered language', () => {
  for (const locale of Object.keys(formatLocales)) {
    const money = formatMoney(1234567.89, 'USD', locale);
    // Whole amounts only; Hindi and Bengali group in lakhs (12,34,568), which is correct for their readers.
    assert.equal(money.replace(/\D/g, ''), '1234568', locale);
    assert.ok(!/۱|١|১|१/.test(money), locale);
    assert.equal(formatNumberInput('1234', locale)?.value, 1234, locale);
  }
  assert.equal(formatNumberInput('1,5', 'fr-FR')?.value, 1.5);
  assert.equal(formatNumberInput('1.5', 'es-MX')?.value, 1.5);
});

test('short month names stay on their calendar month in EN, RU and UZ', async () => {
 const { formatMonthShort } = await import('../lib/format.ts');
 assert.equal(formatMonthShort('2026-09', 'en-US'), 'Sep');
 assert.equal(formatMonthShort('2026-01-01', 'en-US'), 'Jan');
 assert.match(formatMonthShort('2026-09', 'ru-RU'), /^сент/);
 assert.ok(formatMonthShort('2026-12', 'uz-UZ').length > 0);
 assert.equal(formatMonthShort('bad', 'en-US'), '—');
});

test('cash account options show the whole balance so same-named accounts stay distinct',()=>{
 assert.equal(formatAccountOption({name:'QA Wallet',amount:2918.4,currency:'USD'},'en-US'),'QA Wallet · $2,918');
 assert.match(formatAccountOption({name:'QA Wallet',amount:'150000.7',currency:'UZS'},'en-US'),/^QA Wallet · UZS\s150,001$/);
 assert.match(formatAccountOption({name:'Кошелёк',amount:1200,currency:'USD'},'ru-RU'),/^Кошелёк · 1\s200\s\$$/);
 assert.match(formatAccountOption({name:'Hamyon',amount:1200,currency:'USD'},'uz-UZ'),/^Hamyon · /);
});

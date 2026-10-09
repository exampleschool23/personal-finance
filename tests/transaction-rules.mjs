import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { categoryChoices, canRecategorize, recategorize, ruleMatches, ruleTargets, suggestedPattern, directionOf } = loadTS('lib/transaction-rules.ts');
const { assignBusiness, moveAccountToBusiness, withAccount } = loadTS('lib/business.ts');
const { changeTags } = loadTS('lib/tags.ts');
const { periodRange, periodDays, earliestTransactionDay, transactionsIn, groupByDay, groupPageByDay, summarizeTransactions, emptyTransactionFilter } = loadTS('lib/transaction-list.ts');

const record = (id, name, kind, amount, date, extra = {}) => ({ id, name, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0, date, frequency: 'Once', notes: '', ...extra });
const categories = [{ id: 'pets', name: 'Pets', direction: 'expense' }, { id: 'tips', name: 'Tips', direction: 'income' }];

test('category choices list one direction: built-in kinds, then custom categories on the general kind', () => {
 assert.deepEqual(categoryChoices(categories, 'expense').map(choice => [choice.kind, choice.category_id]), [['Rent expense', null], ['Living expense', null], ['Charity', null], ['Other expense', null], ['Other expense', 'pets']]);
 assert.deepEqual(categoryChoices(categories, 'income').at(-1), { kind: 'Other income', category_id: 'tips', name: 'Tips', custom: true });
 assert.equal(directionOf('Salary'), 'income');assert.equal(directionOf('Charity'), 'expense');assert.equal(directionOf('Cash'), null);
});

test('only plain transactions change category, within their direction, and unchanged rows are not counted', () => {
 const rows = [record('a', 'Shop', 'Living expense', 5, '2026-09-01'), record('b', 'Pay', 'Salary', 900, '2026-09-01'), record('c', 'Fee', 'Other expense', 1, '2026-09-01', { operation_id: 'op' }),
  record('d', 'Split', 'Other expense', 10, '2026-09-01'), record('e', 'Plan', 'Living expense', 50, '2026-09-01', { frequency: 'Monthly' }), record('f', 'Pets', 'Other expense', 4, '2026-09-01', { custom_category_id: 'pets' })];
 const splits = [{ record_id: 'd', position: 0, category_id: 'pets', amount: 5 }];
 assert.ok(canRecategorize(rows[0]));
 for (const index of [2, 4]) assert.ok(!canRecategorize(rows[index]));
 assert.ok(!canRecategorize(rows[3], splits));
 const result = recategorize(rows, ['a', 'b', 'c', 'd', 'e', 'f'], { kind: 'Other expense', category_id: 'pets' }, splits);
 assert.equal(result.changed, 1);
 assert.deepEqual(result.records.find(row => row.id === 'a'), { ...rows[0], kind: 'Other expense', custom_category_id: 'pets' });
 assert.equal(result.records.find(row => row.id === 'b').kind, 'Salary');
 assert.equal(rows[0].kind, 'Living expense', 'the input is not mutated');
 assert.equal(recategorize(rows, ['f'], { kind: 'Charity', category_id: null }).records[0].kind, 'Living expense');
 assert.equal(recategorize(rows, ['f'], { kind: 'Charity', category_id: null }).records.find(row => row.id === 'f').custom_category_id, null);
});

test('rules match a name fragment case-insensitively within one direction', () => {
 const rule = { id: 'r', pattern: ' starbucks ', direction: 'expense', kind: 'Charity', category_id: null, business_id: null, tag_ids: [] };
 const rows = [record('a', 'STARBUCKS #12', 'Living expense', 5, '2026-09-01'), record('b', 'Starbucks refund', 'Other income', 5, '2026-09-01'), record('c', 'Starbucks', 'Charity', 5, '2026-09-01'), record('d', 'Starbucks plan', 'Living expense', 5, '2026-09-01', { frequency: 'Monthly' })];
 assert.ok(ruleMatches(rule, rows[0]));
 assert.ok(!ruleMatches(rule, rows[1]));
 assert.deepEqual(ruleTargets(rule, rows), ['a'], 'already in the category or scheduled rows are not targets');
 assert.ok(!ruleMatches({ ...rule, pattern: '  ' }, rows[0]));
 assert.equal(suggestedPattern('STARBUCKS #1234'), 'STARBUCKS');
 assert.equal(suggestedPattern('Uber *trip 55-21'), 'Uber *trip');
 assert.equal(suggestedPattern('7-Eleven'), '7-Eleven');
});

test('rules can set a business and tags in both directions; business income keeps its business', () => {
 const rows = [record('a', 'CandleScience order', 'Other expense', 50, '2026-09-01'), record('b', 'CandleScience refund', 'Other income', 5, '2026-09-02'), record('c', 'CandleScience', 'Other expense', 9, '2026-09-03', { business_id: 'biz' }),
  record('d', 'Payout', 'Business income', 90, '2026-09-04', { business_id: 'biz' }), record('e', 'CandleScience plan', 'Other expense', 9, '2026-09-05', { expense_plan_id: 'plan' })];
 const rule = { id: 'r', pattern: 'candlescience', direction: 'any', kind: null, category_id: null, business_id: 'biz', tag_ids: [] };
 assert.ok(ruleMatches(rule, rows[0]) && ruleMatches(rule, rows[1]));
 assert.deepEqual(ruleTargets(rule, rows), ['a', 'b'], 'rows already in the business and planned spending are left alone');
 assert.deepEqual(ruleTargets({ ...rule, business_id: null, tag_ids: ['t'] }, rows, [], id => id === 'a' ? ['t'] : []), ['b', 'c', 'e'], 'tags go only where they are missing');
 // Business transactions change category freely; only a transaction with a business may become business income.
 assert.ok(canRecategorize(rows[2]));
 assert.equal(recategorize(rows, ['a', 'b'], { kind: 'Business income', category_id: null }).changed, 0);
 assert.equal(recategorize(rows, ['c'], { kind: 'Living expense', category_id: null }).changed, 1);
 // The sample workspace's copies of the database functions.
 const moved = assignBusiness(rows, ['a', 'd', 'e'], null);
 assert.equal(moved.changed, 0, 'unassigned rows stay, business income keeps its business');
 const named = assignBusiness(rows, ['a', 'd'], 'other', new Map([['other', 'Other Co']]));
 assert.equal(named.changed, 2);assert.equal(named.records.find(row => row.id === 'd').name, 'Other Co', 'business income is named after its business');
 const accounts = [record('acc', 'Checking', 'Cash', 100, '2026-01-01'), record('t1', 'Wax', 'Other expense', 5, '2026-09-01', { account_id: 'acc' }), record('t2', 'Lunch', 'Other expense', 5, '2026-09-01', { account_id: 'acc', business_id: 'mine' })];
 const account = moveAccountToBusiness(accounts, 'acc', 'biz');
 assert.equal(account.changed, 1);assert.equal(account.records[0].business_id, 'biz');assert.equal(account.records[1].business_id, 'biz');assert.equal(account.records[2].business_id, 'mine', 'a business chosen by hand stays');
 assert.equal(withAccount(record('n', 'New', 'Other expense', 1, '2026-09-01'), 'acc', account.records).business_id, 'biz', 'a new transaction takes its account’s business');
 assert.equal(withAccount(record('n', 'New', 'Other expense', 1, '2026-09-01', { business_id: 'mine' }), 'acc', account.records).business_id, 'mine');
 const tagged = changeTags([{ record_id: 'a', tag_id: 't' }], rows, ['a', 'b'], ['u'], ['t']);
 assert.equal(tagged.changed, 2);assert.deepEqual(tagged.links.map(link => link.record_id + link.tag_id).sort(), ['au', 'bu']);
});

test('a period covers whole days up to today, and a custom range of days narrows the list to those days', () => {
 assert.deepEqual(periodDays('this_month', '2026-10-09'), { from: '2026-10-01', to: '2026-10-09' }, 'never past today');
 assert.deepEqual(periodDays('last_month', '2026-03-09'), { from: '2026-02-01', to: '2026-02-28' });
 assert.deepEqual(periodDays('three_months', '2026-10-09'), { from: '2026-08-01', to: '2026-10-09' });
 assert.equal(earliestTransactionDay('2026-10-09'), '2024-11-01', 'a custom range stays inside the 24 months one read covers');
 const rows = [record('a', 'Coffee', 'Living expense', 4, '2026-10-01'), record('b', 'Tea', 'Living expense', 3, '2026-10-05'), record('c', 'Lunch', 'Living expense', 9, '2026-10-06'), record('d', 'Bus', 'Living expense', 2, '2026-09-30')];
 const name = row => row.kind;
 assert.deepEqual(transactionsIn(rows, { from: '2026-10-01', to: '2026-10-05' }, '2026-10-09', emptyTransactionFilter, name).map(row => row.id), ['b', 'a'], 'both ends are included');
 assert.deepEqual(transactionsIn(rows, { from: '2026-09', to: '2026-10' }, '2026-10-09', emptyTransactionFilter, name).map(row => row.id), ['c', 'b', 'a', 'd'], 'months still cover every day in them');
});

test('the list keeps the period, search and filters, newest first, grouped by day with net totals', () => {
 assert.deepEqual(periodRange('this_month', '2026-10-02'), { from: '2026-10', to: '2026-10' });
 assert.deepEqual(periodRange('last_month', '2026-01-15'), { from: '2025-12', to: '2025-12' });
 assert.deepEqual(periodRange('three_months', '2026-10-02'), { from: '2026-08', to: '2026-10' });
 assert.deepEqual(periodRange('this_year', '2026-10-02'), { from: '2026-01', to: '2026-10' });
 assert.deepEqual(periodRange('twelve_months', '2026-10-02'), { from: '2025-11', to: '2026-10' });
 const rows = [record('a', 'Coffee', 'Living expense', 4, '2026-10-01'), record('b', 'Salary', 'Salary', 1000, '2026-10-01'), record('c', 'Rent', 'Rent expense', 12500000, '2026-10-02', { currency: 'UZS' }),
  record('d', 'Old', 'Living expense', 9, '2026-09-30'), record('e', 'Future', 'Living expense', 9, '2026-10-03'), record('f', 'Plan', 'Living expense', 9, '2026-10-01', { frequency: 'Monthly' }), record('g', 'Cash', 'Cash', 500, '2026-10-01'), record('h', 'Euro', 'Other expense', 5, '2026-10-02', { currency: 'EUR' })];
 const name = row => row.kind;
 const range = periodRange('this_month', '2026-10-02');
 const list = transactionsIn(rows, range, '2026-10-02', emptyTransactionFilter, name);
 assert.deepEqual(list.map(row => row.id), ['h', 'c', 'a', 'b']);
 assert.deepEqual(transactionsIn(rows, range, '2026-10-02', { ...emptyTransactionFilter, direction: 'income' }, name).map(row => row.id), ['b']);
 assert.deepEqual(transactionsIn(rows, range, '2026-10-02', { ...emptyTransactionFilter, query: 'rent EXP' }, name).map(row => row.id), ['c'], 'search covers the category name');
 assert.deepEqual(transactionsIn(rows, range, '2026-10-02', { ...emptyTransactionFilter, category: 'Living expense' }, name).map(row => row.id), ['a']);
 const owned = rows.map(row => row.id === 'c' ? { ...row, business_id: 'biz' } : row);
 assert.deepEqual(transactionsIn(owned, range, '2026-10-02', { ...emptyTransactionFilter, businesses: ['biz'] }, name).map(row => row.id), ['c']);
 assert.deepEqual(transactionsIn(owned, range, '2026-10-02', { ...emptyTransactionFilter, businesses: ['household'] }, name).map(row => row.id), ['h', 'a', 'b'], 'the household is everything without a business');
 assert.deepEqual(transactionsIn(owned, range, '2026-10-02', { ...emptyTransactionFilter, tags: ['t'] }, name, id => id === 'a' ? ['t'] : []).map(row => row.id), ['a']);
 // Several tags: any of them by default, or only rows carrying all of them.
 const tagged = { a: ['trip', 'tax'], b: ['trip'], c: ['tax'] };
 const tagsOf = id => tagged[id] ?? [];
 assert.deepEqual(transactionsIn(owned, range, '2026-10-02', { ...emptyTransactionFilter, tags: ['trip', 'tax'] }, name, tagsOf).map(row => row.id), ['c', 'a', 'b']);
 assert.deepEqual(transactionsIn(owned, range, '2026-10-02', { ...emptyTransactionFilter, tags: ['trip', 'tax'], tagMatch: 'all' }, name, tagsOf).map(row => row.id), ['a']);
 assert.deepEqual(transactionsIn(owned, range, '2026-10-02', { ...emptyTransactionFilter, tags: ['tax'], tagMatch: 'all', businesses: ['household'] }, name, tagsOf).map(row => row.id), ['a'], 'tags combine with the other filters');
 assert.deepEqual(transactionsIn(owned, range, '2026-10-02', { ...emptyTransactionFilter, tagMatch: 'all' }, name, tagsOf).map(row => row.id), ['h', 'c', 'a', 'b'], 'no chosen tags shows everything');
 const convert = (amount, unit) => unit === 'USD' ? amount : unit === 'UZS' ? amount / 12500 : null;
 const days = groupByDay(list, convert);
 assert.deepEqual(days.map(day => [day.date, day.total]), [['2026-10-02', null], ['2026-10-01', 996]]);
 assert.deepEqual(groupByDay(list.filter(row => row.id !== 'h'), convert)[0].total, -1000);
 const summary = summarizeTransactions(list, convert);
 assert.deepEqual(summary, { count: 4, received: 1000, spent: 1004, largest: { name: 'Rent', amount: 1000 }, missing: 1 });
});

test('rule criteria: an exact name, an account, a business, a category and an amount range narrow a rule', () => {
 const { hasCriteria, extraCriteria, ruleCriterion, openCriteria } = loadTS('lib/transaction-rules.ts');
 const shop = record('a', ' Shop ', 'Other expense', 40, '2026-09-01', { account_id: 'checking', business_id: 'candles', custom_category_id: 'ads' });
 const longer = record('b', 'Shop online', 'Other expense', 400, '2026-09-01', { account_id: 'card' });
 const base = { pattern: 'shop', direction: 'any', ...openCriteria };
 assert.ok(ruleMatches(base, shop) && ruleMatches(base, longer));
 assert.ok(ruleMatches({ pattern: 'shop', direction: 'any' }, longer), 'a rule saved before criteria existed still matches by name');
 assert.ok(ruleMatches({ ...base, pattern: ' SHOP ', match: 'exact' }, shop), 'an exact name ignores case and the spaces around it');
 assert.ok(!ruleMatches({ ...base, match: 'exact' }, longer));
 assert.ok(ruleMatches({ ...base, account_id: 'checking' }, shop) && !ruleMatches({ ...base, account_id: 'checking' }, longer));
 assert.ok(ruleMatches({ ...base, match_business_id: 'candles' }, shop) && !ruleMatches({ ...base, match_business_id: 'candles' }, longer));
 assert.ok(ruleMatches({ ...base, match_kind: 'Other expense', match_category_id: 'ads' }, shop));
 assert.ok(!ruleMatches({ ...base, match_kind: 'Other expense', match_category_id: null }, shop), 'the general category is not a custom one');
 assert.ok(ruleMatches({ ...base, match_kind: 'Other expense', match_category_id: null }, longer));
 assert.ok(ruleMatches({ ...base, amount_min: 40, amount_max: 40 }, shop) && !ruleMatches({ ...base, amount_min: 40.01 }, shop) && !ruleMatches({ ...base, amount_max: 399.99 }, longer));
 // The name is optional once another criterion is set; a rule with no criterion matches nothing.
 assert.ok(ruleMatches({ ...base, pattern: '', account_id: 'card' }, longer) && !ruleMatches({ ...base, pattern: '', account_id: 'card' }, shop));
 assert.ok(!ruleMatches({ ...base, pattern: '  ' }, shop));
 assert.ok(!hasCriteria({ ...base, pattern: '' }) && hasCriteria({ ...base, pattern: '', amount_max: 5 }));
 assert.equal(extraCriteria({ ...base, account_id: 'x', match_business_id: 'y', match_kind: 'Charity', amount_min: 0, amount_max: 9 }), 4, 'an amount range counts once');
 assert.equal(extraCriteria(base), 0);
 assert.deepEqual(ruleCriterion({ ...base, match_kind: 'Other expense', match_category_id: 'ads' }), { kind: 'Other expense', category_id: 'ads' });
 assert.equal(ruleCriterion(base), null);
 // Applying a rule changes only what its criteria reach.
 const rule = { id: 'r', ...base, pattern: '', account_id: 'card', kind: null, category_id: null, business_id: 'candles', tag_ids: [] };
 assert.deepEqual(ruleTargets(rule, [shop, longer]), ['b']);
});

test('the rule schema accepts criteria and rejects a rule without one, a reversed range or a category of the other direction', () => {
 const { transactionRuleSchemas } = loadTS('lib/transaction-rule-schemas.ts');
 const uuid = n => `00000000-0000-4000-8000-00000000000${n}`;
 const rule = { id: uuid(1), pattern: 'shop', match: 'contains', direction: 'expense', account_id: null, match_business_id: null, match_kind: null, match_category_id: null, amount_min: null, amount_max: null, kind: null, category_id: null, business_id: uuid(2), tag_ids: [], apply: false };
 const ok = value => transactionRuleSchemas.save_rule.safeParse(value).success;
 assert.ok(ok(rule));
 assert.ok(ok({ ...rule, pattern: '', account_id: uuid(3) }) && ok({ ...rule, pattern: ' ', amount_min: 0 }), 'another criterion replaces the name');
 assert.ok(!ok({ ...rule, pattern: '' }), 'a rule needs a criterion');
 assert.ok(!ok({ ...rule, match: 'regex' }));
 assert.ok(!ok({ ...rule, amount_min: 50, amount_max: 10 }) && !ok({ ...rule, amount_min: -1 }) && ok({ ...rule, amount_min: 10, amount_max: 10 }));
 assert.ok(!ok({ ...rule, match_kind: 'Salary' }) && ok({ ...rule, direction: 'any', match_kind: 'Salary' }) && ok({ ...rule, match_kind: 'Charity' }));
 assert.ok(!ok({ ...rule, match_kind: 'Charity', match_category_id: uuid(4) }) && ok({ ...rule, match_kind: 'Other expense', match_category_id: uuid(4) }));
 const older = Object.fromEntries(Object.entries(rule).filter(([key]) => key !== 'account_id'));
 assert.ok(!ok(older), 'every criterion is sent, so an update can clear it');
});

test('the longest period reaches 24 months, and long selections are sent in parts', () => {
 const { chunks, transactionPeriods } = loadTS('lib/transaction-list.ts');
 assert.deepEqual(periodRange('two_years', '2026-10-02'), { from: '2024-11', to: '2026-10' });
 assert.equal(transactionPeriods.at(-1), 'two_years');
 assert.deepEqual(chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
 assert.deepEqual(chunks([], 500), []);
 assert.deepEqual(chunks(Array.from({ length: 1001 }, (_, index) => index), 500).map(part => part.length), [500, 500, 1]);
});

test('business helpers: colours, filters, who can take a business, account groups and the setup guide', () => {
 const { nextPaletteColor, paletteColor, businessesIn, canAssignBusiness, inBusinessFilter, businessAccountGroups, isBusinessAccount, setupGuide, HOUSEHOLD } = loadTS('lib/business.ts');
 assert.equal(nextPaletteColor([]), 'teal');assert.equal(nextPaletteColor(['teal', 'blue', null]), 'indigo');
 assert.equal(nextPaletteColor(['teal', 'blue', 'indigo', 'violet', 'pink', 'red', 'orange', 'amber', 'green']), 'slate', 'grey is the last resort');
 assert.equal(paletteColor('nope'), paletteColor('slate'));assert.notEqual(paletteColor('teal'), paletteColor('blue'));assert.equal(paletteColor(null), paletteColor(undefined));
 const rows = [record('biz', 'Candles', 'Business', 0, '2026-01-01'), record('cash', 'Checking', 'Cash', 10, '2026-01-01'), record('loan', 'Loan', 'Loan', 10, '2026-01-01'), record('pay', 'Pay', 'Salary', 10, '2026-01-01', { income_source_id: 'job' }),
  record('sale', 'Sale', 'Business income', 10, '2026-01-01', { business_id: 'biz' }), record('plan', 'Groceries', 'Living expense', 10, '2026-01-01', { expense_plan_id: 'p' }), record('buy', 'Wax', 'Other expense', 10, '2026-01-01')];
 assert.deepEqual(businessesIn(rows).map(row => row.id), ['biz']);
 assert.ok(inBusinessFilter([], null) && inBusinessFilter([HOUSEHOLD], undefined) && inBusinessFilter(['biz', HOUSEHOLD], 'biz') && !inBusinessFilter(['biz'], null) && !inBusinessFilter([HOUSEHOLD], 'biz'));
 assert.ok(canAssignBusiness(rows[6], 'biz') && !canAssignBusiness(rows[6], null), 'a household transaction can move to a business, and is already in the household');
 assert.ok(!canAssignBusiness(rows[3], 'biz'), 'salary from a source follows its source');
 assert.ok(!canAssignBusiness(rows[4], null) && !canAssignBusiness(rows[4], 'biz'), 'business income keeps a business');
 assert.ok(!canAssignBusiness(rows[5], 'biz'), 'planned spending stays household spending');
 assert.ok(!canAssignBusiness(rows[1], 'biz'), 'an account is not a transaction');
 // Every record that can belong to a business falls in exactly one group.
 for (const kind of ['Cash', 'Deposit', 'Treasury bill', 'Stock', 'Crypto', 'Property', 'Valuables', 'Money lent', 'Mortgage', 'Loan', 'Debt']) {
  assert.ok(isBusinessAccount({ kind }), kind);
  assert.equal(businessAccountGroups.filter(([, matches]) => matches({ kind })).length, 1, kind);
 }
 assert.ok(!isBusinessAccount({ kind: 'Business' }) && !businessAccountGroups.some(([, matches]) => matches({ kind: 'Salary' })));
 // The guide: three steps with a page each; tagged history is offered to those who tracked by hand, or who have tags.
 const hrefs = cards => cards.map(card => card.href);
 assert.deepEqual(hrefs(setupGuide(false, true)), ['/transactions?business=household', '/settings#rules', '/reports?tab=tax']);
 assert.deepEqual(hrefs(setupGuide(true, false)), ['/transactions', '/settings#tags', '/settings#rules']);
 assert.deepEqual(hrefs(setupGuide(null, true)).at(-1), '/settings#tags');
 assert.equal(setupGuide(null, false).length, 3);
 for (const card of [...setupGuide(true, true), ...setupGuide(null, true)]) assert.ok(card.title && card.detail && card.action && card.emoji);
});

test('tags: counts, tags of a transaction, what can be tagged, and the tag schema', () => {
 const { tagsByRecord, tagCounts, canTag, tagSchemas, matchesTags } = loadTS('lib/tags.ts');
 assert.ok(matchesTags([], [], 'all') && matchesTags(['trip'], ['trip', 'tax'], 'any') && matchesTags(['tax', 'trip', 'x'], ['trip', 'tax'], 'all'));
 assert.ok(!matchesTags(['trip'], ['trip', 'tax'], 'all') && !matchesTags([], ['trip'], 'any'));
 const links = [{ record_id: 'a', tag_id: 'trip' }, { record_id: 'a', tag_id: 'tax' }, { record_id: 'b', tag_id: 'trip' }];
 assert.deepEqual([...tagsByRecord(links)], [['a', ['trip', 'tax']], ['b', ['trip']]]);
 assert.deepEqual([...tagCounts(links)], [['trip', 2], ['tax', 1]]);
 assert.equal(tagCounts([]).size, 0);
 assert.ok(canTag({ kind: 'Other expense', frequency: 'Once', history_event_id: null }) && canTag({ kind: 'Salary', frequency: 'Once' }));
 assert.ok(!canTag({ kind: 'Other expense', frequency: 'Monthly' }) && !canTag({ kind: 'Cash', frequency: 'Once' }) && !canTag({ kind: 'Other expense', frequency: 'Once', history_event_id: 'e' }));
 const id = '00000000-0000-4000-8000-000000000001';
 assert.equal(tagSchemas.save.parse({ id, name: '  Trip  ', color: 'teal' }).name, 'Trip');
 assert.ok(!tagSchemas.save.safeParse({ id, name: ' ', color: 'teal' }).success && !tagSchemas.save.safeParse({ id, name: 'x'.repeat(61), color: 'teal' }).success && !tagSchemas.save.safeParse({ id, name: 'Trip', color: 'neon' }).success);
 assert.ok(!tagSchemas.delete.safeParse({ id: 'nope' }).success);
});

test('a rule form becomes a rule: name trimmed, categories only within one direction, a range that holds and at least one action',()=>{
 const { finishedRule, canSaveRule, amountRangeValid, newRule, ruleFromChange, ruleFromBusiness } = loadTS('lib/transaction-rules.ts');
 const draft={...newRule(),pattern:'  Uber ',kind:'Living expense',category_id:null,match_kind:'Charity',match_category_id:null};
 const expense=finishedRule(draft);
 assert.equal(expense.pattern,'Uber');assert.equal(expense.kind,'Living expense');assert.equal(expense.match_kind,'Charity');
 // An income rule cannot set or require an expense category, and a rule for both directions sets none at all.
 for(const direction of ['income','any']){const rule=finishedRule({...draft,direction});assert.deepEqual([rule.kind,rule.category_id,rule.match_kind,rule.match_category_id],[null,null,null,null]);}
 assert.equal(canSaveRule(expense),true);
 assert.equal(canSaveRule(finishedRule({...draft,direction:'any'})),false,'no action left');
 assert.equal(canSaveRule(finishedRule({...draft,direction:'any',tag_ids:['t1']})),true);
 assert.equal(canSaveRule({...expense,pattern:''}),true,'the required category still narrows it');
 assert.equal(canSaveRule({...expense,pattern:'',match_kind:null}),false,'nothing narrows it');
 assert.equal(amountRangeValid({amount_min:50,amount_max:20}),false);
 assert.equal(amountRangeValid({amount_min:null,amount_max:0}),true);
 assert.equal(canSaveRule({...expense,amount_min:50,amount_max:20}),false);
 const record={id:'r',name:'UBER *TRIP 1234',kind:'Living expense'};
 assert.deepEqual([ruleFromChange(record,{kind:'Other income',category_id:'c1'}).direction,ruleFromChange(record,{kind:'Charity',category_id:null}).direction],['income','expense']);
 assert.deepEqual([ruleFromBusiness(record,'b1').direction,ruleFromBusiness(record,'b1').business_id],['any','b1']);
});

test('a page of transactions shows each day\'s whole total, also when the day runs onto the next page', () => {
 const convert = amount => amount;
 const rows = [record('a', 'Bonus', 'Salary', 500, '2026-10-03'), record('b', 'Rent', 'Rent expense', 900, '2026-10-03'), record('c', 'Pay', 'Salary', 3000, '2026-10-03'), record('d', 'Lunch', 'Living expense', 12, '2026-10-02')];
 assert.deepEqual(groupPageByDay(rows, 0, 2, convert).map(day => [day.date, day.records.length, day.total]), [['2026-10-03', 2, 2600]]);
 assert.deepEqual(groupPageByDay(rows, 2, 4, convert).map(day => [day.date, day.records.length, day.total]), [['2026-10-03', 1, 2600], ['2026-10-02', 1, -12]]);
 assert.equal(groupPageByDay([{ ...rows[0], currency: 'UZS' }, rows[1]], 0, 1, (amount, unit) => unit === 'USD' ? amount : null)[0].total, null, 'a day with an unconvertible row stays unknown');
});

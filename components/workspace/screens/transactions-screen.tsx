"use client";
import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { ListChecks, Plus, ReceiptText, Search, Wand2 } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { PanelSkeleton } from '@/components/presentation-foundation/loading-placeholder';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { BulkCategoryBar, CategoryPicker, DayGroup, RuleDialog, RulesDialog, TransactionAmount, ruleFromChange, useChoiceName } from '@/components/transactions-page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { useTransactionRules } from '@/hooks/use-transaction-rules';
import { depositToday } from '@/lib/deposit-interest';
import { showAction, showError, showNotice } from '@/lib/feedback';
import { expenses, income, normalizeEntry, type Entry } from '@/lib/finance';
import { formatMoney, formatNumber } from '@/lib/format';
import { convertAmount } from '@/lib/market';
import { emptyPlanning, type Category } from '@/lib/planning';
import { emptyTransactionFilter, groupByDay, periodRange, summarizeTransactions, transactionPeriodLabels, transactionPeriods, transactionsIn, type TransactionPeriod } from '@/lib/transaction-list';
import { canRecategorize, categoryChoices, choiceKey, directionOf, type CategoryChoice, type TransactionRule } from '@/lib/transaction-rules';

export function TransactionsScreen() {
 const { t, locale } = useLanguage();
 const { user, demo, reload, currency, market, planning, transactionTools, workspaceLoading, addCashFlow, setViewing, storedRecord, categorize, refreshRecords } = useWorkspace();
 const today = depositToday();
 const [period, setPeriod] = useState<TransactionPeriod>('this_month');
 const [filter, setFilter] = useState(emptyTransactionFilter);
 const [selecting, setSelecting] = useState(false);
 const [selected, setSelected] = useState<Set<string>>(new Set());
 const [rule, setRule] = useState<TransactionRule | null>(null);
 const [rulesOpen, setRulesOpen] = useState(false);
 const live = !!user && !demo;
 const range = periodRange(period, today);
 const remote = useOwnerResource(`/api/planning?scope=budget&month=${range.to}&from=${range.from}`, user, live, reload, emptyPlanning);
 const data = useMemo(() => live ? { ...remote.data, records: remote.data.records.map(normalizeEntry) } : planning.data, [live, remote.data, planning.data]);
 const splits = transactionTools.data.splits;
 const rules = useTransactionRules(user, demo, reload, data.records, splits, categorize, refreshRecords);
 const choiceName = useChoiceName(data.categories);
 const nameOf = (record: Entry) => choiceName({ kind: record.kind, category_id: record.custom_category_id ?? null });
 const records = transactionsIn(data.records, range, today, filter, nameOf);
 const rates = market?.rates ?? market?.fx?.rate;
 const convert = (amount: number, unit: string) => convertAmount(amount, unit, currency, rates);
 const days = groupByDay(records, convert);
 const summary = summarizeTransactions(records, convert);
 const accounts = new Map(data.records.filter(record => record.kind === 'Cash').map(record => [record.id, record.name]));
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const chosen = records.filter(record => selected.has(record.id));
 const directions = new Set(chosen.map(record => directionOf(record.kind)));
 const bulkDirection = directions.size > 1 ? 'mixed' : chosen.length ? [...directions][0] : null;
 const categoryOptions = [...categoryChoices(data.categories, 'income'), ...categoryChoices(data.categories, 'expense')];

 async function change(targets: Entry[], choice: CategoryChoice) {
  try {
   const changed = await categorize(targets.map(record => record.id), choice);
   const skipped = targets.length - changed;
   if (targets.length === 1 && changed === 1) showAction('Updated to {category}', { params: { category: choiceName(choice) }, detail: 'Create a rule to do this automatically in the future.', action: 'Create rule', onAction: () => setRule(ruleFromChange(targets[0], choice)) });
   else showNotice(skipped ? t('{changed} updated; {skipped} could not change category here.', { changed, skipped }) : t('{changed} updated', { changed }));
  } catch (error) { showError((error as Error).message || 'Could not save changes.'); }
 }
 const toggle = (id: string) => setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
 const open = (record: Entry) => (event: MouseEvent | KeyboardEvent) => {
  if ((event.target as HTMLElement).closest('button,a,input,label')) return;
  if ('key' in event && event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  if (selecting) toggle(record.id); else setViewing(storedRecord(record));
 };
 const loading = workspaceLoading || (live ? remote.initialLoading : planning.loading);
 const error = live ? remote.error : planning.error;

 return <div data-page="Transactions" className="content transactions-content">
  <PageHeader title={t('Transactions')} hint={t('Every income and spending record in one list, grouped by day. Click a category to change it.')}>
   <Button variant="outline" onClick={() => setRulesOpen(true)}><Wand2 size={16} aria-hidden="true"/>{t('Rules')}</Button>
   <Button variant="outline" aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}><ListChecks size={16} aria-hidden="true"/>{t('Edit multiple')}</Button>
   <Button onClick={() => addCashFlow('Other expense')}><Plus size={16} aria-hidden="true"/>{t('Add transaction')}</Button>
  </PageHeader>
  <div className="transactions-tools">
   <label className="transactions-search"><Search size={16} aria-hidden="true"/><Input type="search" placeholder={t('Search transactions')} aria-label={t('Search transactions')} maxLength={200} value={filter.query} onChange={event => setFilter({ ...filter, query: event.currentTarget.value })}/></label>
   <NativeSelect aria-label={t('Period')} value={period} onChange={event => setPeriod(event.currentTarget.value as TransactionPeriod)}>{transactionPeriods.map(item => <option key={item} value={item}>{t(transactionPeriodLabels[item])}</option>)}</NativeSelect>
   <NativeSelect aria-label={t('Category')} value={filter.category} onChange={event => setFilter({ ...filter, category: event.currentTarget.value })}>
    <option value="all">{t('All categories')}</option>
    {categoryOptions.map(choice => <option key={choiceKey(choice)} value={choiceKey(choice)}>{choice.custom ? choice.name : t(choice.name)}</option>)}
   </NativeSelect>
   <Segmented label={t('Type')} options={[{ value: 'all', label: t('All') }, { value: 'income', label: t('Income') }, { value: 'expense', label: t('Expenses') }] as const} value={filter.direction} onChange={direction => setFilter({ ...filter, direction })}/>
  </div>
  {selecting && <BulkCategoryBar count={chosen.length} direction={bulkDirection as Category['direction'] | 'mixed' | null} categories={data.categories} onChange={choice => change(chosen.filter(record => canRecategorize(record, splits)), choice).then(() => setSelected(new Set()))} onCancel={() => { setSelecting(false); setSelected(new Set()); }}/>}
  {error ? <InlineError message={t(error)} onRetry={live ? remote.retry : refreshRecords}/> : loading ? <PanelSkeleton label={t('Loading records…')} rows={6}/> : <div className="transactions-layout">
   <section className="panel transactions-list" aria-label={t('Transactions')}>
    {days.length ? days.map(day => <DayGroup key={day.date} date={day.date} total={day.total} currency={currency} today={today}>
     {day.records.map(record => {
      const editable = canRecategorize(record, splits);
      return <li key={record.id} className="transaction-row" data-selected={selected.has(record.id) || undefined} tabIndex={0} aria-label={t('View details for {name}', { name: record.name })} onClick={open(record)} onKeyDown={open(record)}>
       {selecting && <input type="checkbox" aria-label={t('Select {name}', { name: record.name })} checked={selected.has(record.id)} onChange={() => toggle(record.id)}/>}
       <span className="transaction-merchant"><CategoryIcon kind={record.custom_category_id ? nameOf(record) : record.kind}/><span><strong>{record.name}</strong>{record.account_id && accounts.get(record.account_id) && <small>{accounts.get(record.account_id)}</small>}</span></span>
       <CategoryPicker record={record} categories={data.categories} disabled={!editable || selecting} onChange={choice => change([record], choice)}/>
       <TransactionAmount record={record}/>
      </li>;
     })}
    </DayGroup>) : <EmptyState icon={<ReceiptText/>} title={t('No transactions')} description={t(filter.query || filter.category !== 'all' || filter.direction !== 'all' ? 'Nothing matches these filters in this period.' : 'Income and spending you record appear here, grouped by day.')}><Button onClick={() => addCashFlow('Other expense')}>{t('Add transaction')}</Button></EmptyState>}
   </section>
   <aside className="panel transactions-summary" aria-label={t('Summary')}>
    <PanelTitle title={t('Summary')}/>
    <dl className="budget-left-summary">
     <div><dt>{t('Transactions')}</dt><dd>{formatNumber(summary.count, locale, 0)}</dd></div>
     <div><dt>{t('Income')}</dt><dd className="positive">{money(summary.received)}</dd></div>
     <div><dt>{t('Spending')}</dt><dd>{money(summary.spent)}</dd></div>
     {summary.largest && <div><dt>{t('Largest expense')}</dt><dd>{money(summary.largest.amount)}</dd></div>}
     <div className="budget-left-total"><dt>{t('Net')}</dt><dd className={summary.received - summary.spent > 0 ? 'positive' : undefined}>{money(summary.received - summary.spent)}</dd></div>
    </dl>
   </aside>
  </div>}
  {rule && <RuleDialog key={rule.id} rule={rule} records={data.records} categories={data.categories} splits={splits} onSave={async (next, apply) => { const changed = await rules.save(next, apply); if (apply) showNotice(t('{changed} updated', { changed })); return changed; }} onClose={() => setRule(null)}/>}
  {rulesOpen && !rule && <RulesDialog rules={rules.rules} categories={data.categories} onEdit={setRule} onAdd={direction => setRule({ id: crypto.randomUUID(), pattern: '', direction, kind: (direction === 'income' ? income : expenses)[3] as Entry['kind'], category_id: null })} onRemove={item => rules.remove(item.id).catch(reason => showError((reason as Error).message))} onClose={() => setRulesOpen(false)}/>}
 </div>;
}

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
import { BulkEditBar, BulkEditSheet, BusinessPicker, CategoryPicker, DayGroup, MortgageSplit, RuleDialog, RulesDialog, TransactionAmount, newRule, ruleFromBusiness, ruleFromChange, useChoiceName } from '@/components/transactions-page';
import { BusinessFilter } from '@/components/presentation-foundation/business-filter';
import { TagChip } from '@/components/presentation-foundation/tag-chip';
import { queryList, useLocationSearch } from '@/hooks/use-location-search';
import { canAssignBusiness, nextPaletteColor } from '@/lib/business';
import { tagsByRecord } from '@/lib/tags';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { useTransactionRules } from '@/hooks/use-transaction-rules';
import { depositToday } from '@/lib/deposit-interest';
import { showAction, showError, showNotice } from '@/lib/feedback';
import { normalizeEntry, type Entry } from '@/lib/finance';
import { formatMoney, formatNumber } from '@/lib/format';
import { convertAmount } from '@/lib/market';
import { emptyPlanning } from '@/lib/planning';
import { chunks, emptyTransactionFilter, filtersTransactions, groupByDay, periodRange, summarizeTransactions, transactionPeriodLabels, transactionPeriods, transactionsIn, type TransactionPeriod } from '@/lib/transaction-list';
import { canRecategorize, canTakeCategory, categoryChoices, choiceKey, type CategoryChoice, type TransactionRule } from '@/lib/transaction-rules';

export function TransactionsScreen() {
 const { t, locale } = useLanguage();
 const { user, demo, reload, currency, market, planning, transactionTools, workspaceLoading, addCashFlow, setViewing, storedRecord, categorize, assignTransactionsBusiness, businessList, tags, refreshRecords } = useWorkspace();
 const today = depositToday();
 const [period, setPeriod] = useState<TransactionPeriod>('this_month');
 const [filter, setFilter] = useState(emptyTransactionFilter);
 // Links such as /transactions?tag=… or ?business=… open the list already filtered.
 const search = useLocationSearch();
 const [appliedSearch, setAppliedSearch] = useState('');
 // They open the longest period, so a tag's or a business's whole history is there to select and move.
 if (search !== appliedSearch) { setAppliedSearch(search); if (search) { setFilter({ ...emptyTransactionFilter, businesses: queryList(search, 'business'), tag: queryList(search, 'tag')[0] ?? 'all' }); setPeriod('two_years'); } }
 const [editingMany, setEditingMany] = useState(false);
 const [selecting, setSelecting] = useState(false);
 const [selected, setSelected] = useState<Set<string>>(new Set());
 const [rule, setRule] = useState<TransactionRule | null>(null);
 const [rulesOpen, setRulesOpen] = useState(false);
 const live = !!user && !demo;
 const range = periodRange(period, today);
 const remote = useOwnerResource(`/api/planning?scope=budget&month=${range.to}&from=${range.from}`, user, live, reload, emptyPlanning);
 const data = useMemo(() => live ? { ...remote.data, records: remote.data.records.map(normalizeEntry) } : planning.data, [live, remote.data, planning.data]);
 const splits = transactionTools.data.splits;
 const tagMap = useMemo(() => tagsByRecord(tags.data.links), [tags.data.links]);
 const tagsOf = (id: string) => tagMap.get(id) ?? [];
 const rules = useTransactionRules(user, demo, reload, data.records, splits, { categorize, assignBusiness: assignTransactionsBusiness, changeTags: tags.change, tagsOf }, refreshRecords);
 const choiceName = useChoiceName(data.categories);
 const nameOf = (record: Entry) => choiceName({ kind: record.kind, category_id: record.custom_category_id ?? null });
 const records = transactionsIn(data.records, range, today, filter, nameOf, tagsOf);
 const tagById = new Map(tags.data.tags.map(tag => [tag.id, tag]));
 const createTag = async (name: string) => { const id = crypto.randomUUID(); await tags.save({ id, name, color: nextPaletteColor(tags.data.tags.map(tag => tag.color)) }); return id; };
 const rates = market?.rates ?? market?.fx?.rate;
 const convert = (amount: number, unit: string) => convertAmount(amount, unit, currency, rates);
 const days = groupByDay(records, convert);
 const summary = summarizeTransactions(records, convert);
 const accounts = new Map(data.records.filter(record => record.kind === 'Cash').map(record => [record.id, record.name]));
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const chosen = records.filter(record => selected.has(record.id));
 const categoryOptions = [...categoryChoices(data.categories, 'income'), ...categoryChoices(data.categories, 'expense')];

 async function change(targets: Entry[], choice: CategoryChoice) {
  try {
   const changed = await categorize(targets.map(record => record.id), choice);
   const skipped = targets.length - changed;
   if (targets.length === 1 && changed === 1) showAction('Updated to {category}', { params: { category: choiceName(choice) }, detail: 'Create a rule to do this automatically in the future.', action: 'Create rule', onAction: () => setRule(ruleFromChange(targets[0], choice)) });
   else showNotice(skipped ? t('{changed} updated; {skipped} could not change category here.', { changed, skipped }) : t('{changed} updated', { changed }));
  } catch (error) { showError((error as Error).message || 'Could not save changes.'); }
 }
 async function moveToBusiness(record: Entry, business: string | null) {
  try {
   const changed = await assignTransactionsBusiness([record.id], business);
   const name = business ? businessList.find(item => item.id === business)?.name ?? '' : t('Household');
   if (changed && business) showAction('Moved to {business}', { params: { business: name }, detail: 'Create a rule to do this automatically in the future.', action: 'Create rule', onAction: () => setRule(ruleFromBusiness(record, business)) });
   else showNotice(changed ? t('Moved to {business}', { business: name }) : t('This transaction keeps its business.'));
  } catch (error) { showError((error as Error).message || 'Could not save changes.'); }
 }
 /** The Edit multiple drawer: every field that changed, applied to the transactions it can apply to. */
 async function editMany(change: { choice: CategoryChoice | null; business: string | null | undefined; add: string[]; remove: string[] }) {
  // The database takes up to 500 transactions at a time.
  const each = async (ids: string[], run: (part: string[]) => Promise<number>) => { let sum = 0; for (const part of chunks(ids, 500)) sum += await run(part); return sum; };
  const ids = chosen.map(record => record.id);
  let changed = 0, kept = 0;
  if (change.choice) changed = Math.max(changed, await each(chosen.filter(record => canTakeCategory(record, change.choice!, splits)).map(record => record.id), part => categorize(part, change.choice!)));
  if (change.business !== undefined) {
   // Planned spending, business income and salary from a source keep their business; say how many stayed.
   const business = change.business;
   kept = chosen.filter(record => (record.business_id ?? null) !== business && !canAssignBusiness(record, business)).length;
   changed = Math.max(changed, await each(ids, part => assignTransactionsBusiness(part, business)));
  }
  if (change.add.length || change.remove.length) changed = Math.max(changed, await each(ids, part => tags.change(part, change.add, change.remove)));
  showNotice(kept ? t('{changed} updated; {skipped} could not change business here.', { changed, skipped: kept }) : t('{changed} updated', { changed }));
  setSelected(new Set());
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
   <AddTransactionMenu onAdd={addCashFlow}/>
  </PageHeader>
  <div className="transactions-tools">
   <label className="transactions-search"><Search size={16} aria-hidden="true"/><Input type="search" placeholder={t('Search transactions')} aria-label={t('Search transactions')} maxLength={200} value={filter.query} onChange={event => setFilter({ ...filter, query: event.currentTarget.value })}/></label>
   <NativeSelect aria-label={t('Period')} value={period} onChange={event => setPeriod(event.currentTarget.value as TransactionPeriod)}>{transactionPeriods.map(item => <option key={item} value={item}>{t(transactionPeriodLabels[item])}</option>)}</NativeSelect>
   <NativeSelect aria-label={t('Category')} value={filter.category} onChange={event => setFilter({ ...filter, category: event.currentTarget.value })}>
    <option value="all">{t('All categories')}</option>
    {categoryOptions.map(choice => <option key={choiceKey(choice)} value={choiceKey(choice)}>{choice.custom ? choice.name : t(choice.name)}</option>)}
   </NativeSelect>
   {businessList.length > 0 && <BusinessFilter businesses={businessList} value={filter.businesses} onChange={businesses => setFilter({ ...filter, businesses })}/>}
   {tags.data.tags.length > 0 && <NativeSelect aria-label={t('Tag')} value={filter.tag} onChange={event => setFilter({ ...filter, tag: event.currentTarget.value })}>
    <option value="all">{t('All tags')}</option>
    {tags.data.tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
   </NativeSelect>}
   <Segmented label={t('Type')} options={[{ value: 'all', label: t('All') }, { value: 'income', label: t('Income') }, { value: 'expense', label: t('Expenses') }] as const} value={filter.direction} onChange={direction => setFilter({ ...filter, direction })}/>
  </div>
  {selecting && <BulkEditBar count={chosen.length} total={records.length} onAll={select => setSelected(new Set(select ? records.map(record => record.id) : []))} onEdit={() => setEditingMany(true)} onCancel={() => { setSelecting(false); setSelected(new Set()); }}/>}
  {error ? <InlineError message={t(error)} onRetry={live ? remote.retry : refreshRecords}/> : loading ? <PanelSkeleton label={t('Loading records…')} rows={6}/> : <div className="transactions-layout">
   <section className="panel transactions-list" aria-label={t('Transactions')}>
    {days.length ? days.map(day => <DayGroup key={day.date} date={day.date} total={day.total} currency={currency} today={today}>
     {day.records.map(record => {
      const editable = canRecategorize(record, splits);
      const recordTags = tagsOf(record.id).map(id => tagById.get(id)).filter(tag => !!tag);
      return <li key={record.id} className="transaction-row" data-selected={selected.has(record.id) || undefined} tabIndex={0} aria-label={t('View details for {name}', { name: record.name })} onClick={open(record)} onKeyDown={open(record)}>
       {selecting && <input type="checkbox" aria-label={t('Select {name}', { name: record.name })} checked={selected.has(record.id)} onChange={() => toggle(record.id)}/>}
       <span className="transaction-merchant"><CategoryIcon kind={record.custom_category_id ? nameOf(record) : record.kind}/><span><strong>{record.name}</strong>{record.account_id && accounts.get(record.account_id) && <small>{accounts.get(record.account_id)}</small>}<MortgageSplit record={record}/>{recordTags.length > 0 && <span className="transaction-tags">{recordTags.map(tag => <TagChip key={tag.id} name={tag.name} color={tag.color}/>)}</span>}</span></span>
       <span className="transaction-labels"><CategoryPicker record={record} categories={data.categories} disabled={!editable || selecting} onChange={choice => change([record], choice)}/>
       {businessList.length > 0 && <BusinessPicker record={record} businesses={businessList} disabled={selecting || record.frequency !== 'Once' || !!record.history_event_id || !!record.earning_source_id || (record.kind === 'Salary' && !!record.income_source_id)} onChange={business => moveToBusiness(record, business)}/>}</span>
       <TransactionAmount record={record}/>
      </li>;
     })}
    </DayGroup>) : <EmptyState icon={<ReceiptText/>} title={t('No transactions')} description={t(filtersTransactions(filter) ? 'Nothing matches these filters in this period.' : 'Income and spending you record appear here, grouped by day.')}><AddTransactionMenu onAdd={addCashFlow}/></EmptyState>}
   </section>
   <aside className="panel transactions-summary" aria-label={t('Summary')}>
    <PanelTitle title={t('Summary')}/>
    <dl className="budget-left-summary">
     <div><dt>{t('Transactions')}</dt><dd>{formatNumber(summary.count, locale, 0)}</dd></div>
     <div><dt>{t('Income')}</dt><dd className={summary.received > 0 ? 'positive' : undefined}>{money(summary.received)}</dd></div>
     <div><dt>{t('Spending')}</dt><dd>{money(summary.spent)}</dd></div>
     {summary.largest && <div><dt>{t('Largest expense')}</dt><dd>{money(summary.largest.amount)}</dd></div>}
     <div className="budget-left-total"><dt>{t('Net')}</dt><dd className={summary.received - summary.spent > 0 ? 'positive' : undefined}>{money(summary.received - summary.spent)}</dd></div>
    </dl>
   </aside>
  </div>}
  {editingMany && <BulkEditSheet records={chosen} categories={data.categories} businesses={businessList} tags={tags.data.tags} tagsOf={tagsOf} onCreateTag={createTag} onSave={editMany} onClose={() => setEditingMany(false)}/>}
  {rule && <RuleDialog key={rule.id} rule={rule} records={data.records} categories={data.categories} businesses={businessList} accounts={[...accounts].map(([id, name]) => ({ id, name }))} tags={tags.data.tags} tagsOf={tagsOf} onCreateTag={createTag} splits={splits} onSave={async (next, apply) => { const changed = await rules.save(next, apply); if (apply) showNotice(t('{changed} updated', { changed })); return changed; }} onClose={() => setRule(null)}/>}
  {rulesOpen && !rule && <RulesDialog rules={rules.rules} categories={data.categories} businesses={businessList} tags={tags.data.tags} onEdit={setRule} onAdd={() => setRule(newRule())} onRemove={item => rules.remove(item.id)} onClose={() => setRulesOpen(false)}/>}
 </div>;
}

/** "Add transaction" offers both directions; each opens the existing income or expense form. */
function AddTransactionMenu({ onAdd }: { onAdd: (kind: Entry['kind']) => void }) {
 const { t } = useLanguage();
 return <DropdownMenu>
  <DropdownMenuTrigger asChild><Button><Plus size={16} aria-hidden="true"/>{t('Add transaction')}</Button></DropdownMenuTrigger>
  <DropdownMenuContent align="end">
   <DropdownMenuItem onSelect={() => onAdd('Other income')}>{t('Add income')}</DropdownMenuItem>
   <DropdownMenuItem onSelect={() => onAdd('Other expense')}>{t('Add expense')}</DropdownMenuItem>
  </DropdownMenuContent>
 </DropdownMenu>;
}

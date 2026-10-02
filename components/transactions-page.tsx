"use client";
import { useState, type ReactNode } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { ConfirmDialog } from '@/components/presentation-foundation/confirm-dialog';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { income, type Entry } from '@/lib/finance';
import { formatDate, formatMoney, formatSignedMoney } from '@/lib/format';
import { isMortgagePayment, spendingAmount, transferAmount } from '@/lib/spending';
import { signedAmount } from '@/lib/transaction-list';
import type { Category } from '@/lib/planning';
import { categoryChoices, choiceKey, directionOf, ruleTargets, suggestedPattern, type CategoryChoice, type TransactionRule } from '@/lib/transaction-rules';

type Choice = ReturnType<typeof categoryChoices>[number];

/** The name shown for a transaction's category: a custom category's own name, or the translated kind. */
export function useChoiceName(categories: readonly Category[]) {
 const { t } = useLanguage();
 return (choice: CategoryChoice) => choice.category_id ? categories.find(category => category.id === choice.category_id)?.name ?? t('Custom category') : t(choice.kind);
}

/** A searchable list of one direction's categories. */
function CategoryList({ categories, direction, selected, onSelect }: { categories: readonly Category[]; direction: Category['direction']; selected?: string; onSelect: (choice: Choice) => void }) {
 const { t } = useLanguage();
 const [query, setQuery] = useState('');
 const name = (choice: Choice) => choice.custom ? choice.name : t(choice.name);
 const options = categoryChoices(categories, direction).filter(choice => name(choice).toLowerCase().includes(query.trim().toLowerCase()));
 return <div className="category-picker">
  <Input autoFocus placeholder={t('Search categories')} aria-label={t('Search categories')} value={query} onChange={event => setQuery(event.currentTarget.value)}/>
  <p className="category-picker-heading">{t(direction === 'income' ? 'Income' : 'Expenses')}</p>
  <ul role="listbox" aria-label={t('Category')}>
   {options.map(choice => <li key={choiceKey(choice)} role="option" aria-selected={selected === choiceKey(choice)}>
    <button type="button" onClick={() => onSelect(choice)}><CategoryIcon kind={choice.custom ? choice.name : choice.kind} size="sm"/><span>{name(choice)}</span>{selected === choiceKey(choice) && <Check size={15} aria-hidden="true"/>}</button>
   </li>)}
   {!options.length && <li className="category-picker-empty">{t('No categories match.')}</li>}
  </ul>
 </div>;
}

/** A transaction's category as a pill; clicking it opens the category list. */
export function CategoryPicker({ record, categories, disabled, onChange }: { record: Entry; categories: readonly Category[]; disabled?: boolean; onChange: (choice: CategoryChoice) => void }) {
 const { t } = useLanguage();
 const [open, setOpen] = useState(false);
 const direction = directionOf(record.kind) ?? 'expense';
 const choice = { kind: record.kind, category_id: record.custom_category_id ?? null };
 const label = useChoiceName(categories)(choice);
 const pill = <span className="transaction-category"><CategoryIcon kind={record.custom_category_id ? label : record.kind} size="sm"/><span>{label}</span></span>;
 if (disabled) return pill;
 return <Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild><button type="button" className="transaction-category-button" aria-label={t('Change category for {name}', { name: record.name })}>{pill}</button></PopoverTrigger>
  <PopoverContent className="category-picker-popover" align="start">
   <CategoryList categories={categories} direction={direction} selected={choiceKey(choice)} onSelect={next => { setOpen(false); if (choiceKey(next) !== choiceKey(choice) || next.kind !== record.kind) onChange(next); }}/>
  </PopoverContent>
 </Popover>;
}

/** The Edit multiple bar: how many are selected and one category change for all of them. */
export function BulkCategoryBar({ count, direction, categories, onChange, onCancel }: { count: number; direction: Category['direction'] | 'mixed' | null; categories: readonly Category[]; onChange: (choice: CategoryChoice) => void; onCancel: () => void }) {
 const { t } = useLanguage();
 const [open, setOpen] = useState(false);
 return <div className="bulk-bar" role="region" aria-label={t('Edit multiple')}>
  <strong>{t('{count} selected', { count })}</strong>
  {direction === 'mixed' ? <span className="bulk-bar-note">{t('Select only income or only expenses to change their category together.')}</span> : <Popover open={open} onOpenChange={setOpen}>
   <PopoverTrigger asChild><Button size="sm" disabled={!count || !direction}>{t('Change category')}</Button></PopoverTrigger>
   <PopoverContent className="category-picker-popover" align="start">{direction && <CategoryList categories={categories} direction={direction} onSelect={choice => { setOpen(false); onChange(choice); }}/>}</PopoverContent>
  </Popover>}
  <Button size="sm" variant="outline" onClick={onCancel}>{t('Done')}</Button>
 </div>;
}

/** One day: its date and net total in the heading, its transactions below. */
export function DayGroup({ date, total, currency, today, children }: { date: string; total: number | null; currency: string; today: string; children: ReactNode }) {
 const { t, locale } = useLanguage();
 const yesterday = new Date(Date.parse(today + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
 const label = date === today ? t('Today') : date === yesterday ? t('Yesterday') : formatDate(date, locale);
 return <section className="transaction-day" aria-label={label}>
  <div className="transaction-day-heading"><h3>{label}</h3><span className={total !== null && total > 0 ? 'positive' : undefined}>{total === null ? '—' : formatSignedMoney(total, currency, locale)}</span></div>
  <ul>{children}</ul>
 </section>;
}

/** A mortgage payment's split: the principal is a transfer to the debt, the interest is spending. */
export function MortgageSplit({ record }: { record: Entry }) {
 const { t, locale } = useLanguage();
 if (!isMortgagePayment(record)) return null;
 return <small>{t('Mortgage payment · Principal: {principal} · Interest: {interest}', { principal: formatMoney(transferAmount(record), record.currency, locale), interest: formatMoney(spendingAmount(record), record.currency, locale) })}</small>;
}

/** The row's signed amount by the shared spending definition (`lib/spending.ts`): a mortgage payment shows its interest. */
export function TransactionAmount({ record }: { record: Entry }) {
 const { locale } = useLanguage();
 const incoming = income.includes(record.kind);
 return <strong className={incoming ? 'transaction-amount positive' : 'transaction-amount'}>{formatSignedMoney(signedAmount(record), record.currency, locale)}</strong>;
}

/** Create or edit a rule: a name fragment and the category it means, optionally applied to past transactions. */
export function RuleDialog({ rule, records, categories, splits, onSave, onClose }: { rule: TransactionRule; records: Entry[]; categories: readonly Category[]; splits: Parameters<typeof ruleTargets>[2]; onSave: (rule: TransactionRule, apply: boolean) => Promise<number>; onClose: () => void }) {
 const { t } = useLanguage();
 const [pattern, setPattern] = useState(rule.pattern);
 const [choice, setChoice] = useState<CategoryChoice>(rule);
 const [apply, setApply] = useState(true);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [open, setOpen] = useState(false);
 const next = { ...rule, ...choice, pattern: pattern.trim() };
 const matches = ruleTargets(next, records, splits).length;
 const choiceName = useChoiceName(categories);
 return <Dialog open onOpenChange={value => { if (!value && !busy) onClose(); }}>
  <DialogContent className="budget-dialog">
   <DialogTitle>{t('Rule')}</DialogTitle>
   <form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { await onSave(next, apply); onClose(); } catch (reason) { setError(t((reason as Error).message)); } finally { setBusy(false); } }}>
    <fieldset disabled={busy} className="budget-dialog-fields">
     <label className="budget-dialog-label">{t('When the name contains')}<Input required maxLength={120} value={pattern} onChange={event => setPattern(event.currentTarget.value)}/></label>
     <div className="budget-dialog-label">{t('Set the category to')}
      <Popover open={open} onOpenChange={setOpen}>
       <PopoverTrigger asChild><button type="button" className="rule-category-button"><CategoryIcon kind={choice.category_id ? choiceName(choice) : choice.kind} size="sm"/>{choiceName(choice)}</button></PopoverTrigger>
       <PopoverContent className="category-picker-popover" align="start"><CategoryList categories={categories} direction={rule.direction} selected={choiceKey(choice)} onSelect={value => { setOpen(false); setChoice(value); }}/></PopoverContent>
      </Popover>
     </div>
     <label className="budget-check"><input type="checkbox" checked={apply} onChange={event => setApply(event.currentTarget.checked)}/><span><strong>{t('Apply to {count} matching transactions', { count: matches })}</strong><small>{t('New bank statement imports follow the rule too. Categories you choose by hand are kept.')}</small></span></label>
     {error && <p className="form-error" role="alert">{error}</p>}
    </fieldset>
    <FormFooter busy={busy} onCancel={onClose}><Button disabled={busy || !pattern.trim()}>{t(busy ? 'Saving…' : 'Save rule')}</Button></FormFooter>
   </form>
  </DialogContent>
 </Dialog>;
}

/** Every saved rule, with a way to add, edit or remove one. */
export function RulesDialog({ rules, categories, onEdit, onAdd, onRemove, onClose }: { rules: TransactionRule[]; categories: readonly Category[]; onEdit: (rule: TransactionRule) => void; onAdd: (direction: Category['direction']) => void; onRemove: (rule: TransactionRule) => Promise<void>; onClose: () => void }) {
 const { t } = useLanguage();
 const choiceName = useChoiceName(categories);
 const [deleting, setDeleting] = useState<TransactionRule | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
 async function remove() {
  if (!deleting || busy) return;
  setBusy(true); setError('');
  try { await onRemove(deleting); setDeleting(null); }
  catch (reason) { setError((reason as Error).message); }
  finally { setBusy(false); }
 }
 return <><Dialog open onOpenChange={value => { if (!value) onClose(); }}>
  <DialogContent className="budget-dialog">
   <DialogTitle>{t('Rules')}</DialogTitle>
   {rules.length ? <ul className="rule-list">{rules.map(rule => <li key={rule.id}>
    <button type="button" onClick={() => onEdit(rule)}><span>{t('Name contains “{pattern}”', { pattern: rule.pattern })}</span><span className="rule-arrow" aria-hidden="true">→</span><span className="transaction-category"><CategoryIcon kind={rule.category_id ? choiceName(rule) : rule.kind} size="sm"/><span>{choiceName(rule)}</span></span></button>
    <Button size="icon" variant="ghost" aria-label={t('Delete {name}', { name: rule.pattern })} onClick={() => { setError(''); setDeleting(rule); }}><Trash2 size={15}/></Button>
   </li>)}</ul> : <p className="budget-left-empty">{t('No rules yet. Change a transaction’s category and choose Create rule, or add one here.')}</p>}
   <div className="record-form-footer"><Button variant="outline" onClick={() => onAdd('income')}>{t('Add income rule')}</Button><Button onClick={() => onAdd('expense')}>{t('Add expense rule')}</Button></div>
  </DialogContent>
 </Dialog>
 <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} busy={busy} destructive error={error} title={t('Delete {name}?', { name: deleting ? t('Name contains “{pattern}”', { pattern: deleting.pattern }) : '' })} description={t('New transactions will no longer be categorized by this rule. Transactions it already changed keep their category.')} confirmLabel={t(busy ? 'Deleting…' : 'Delete rule')} onConfirm={remove}/></>;
}

/** A new rule suggested from one category change. */
export const ruleFromChange = (record: Entry, choice: CategoryChoice): TransactionRule => ({ id: crypto.randomUUID(), pattern: suggestedPattern(record.name), direction: directionOf(choice.kind) ?? 'expense', ...choice });

"use client";
import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { budgetTypeLabels, budgetTypes, flexBucketKey, remainingTone, type BudgetCategory, type BudgetCategorySetting, type BudgetMode, type BudgetRow, type BudgetType } from '@/lib/budget';
import { showError } from '@/lib/feedback';
import { formatMoney, formatSignedMoney } from '@/lib/format';
import { useCategoryName } from './budget-rows';

const typeHints: Record<BudgetType, string> = {
 fixed: 'The same every month, such as rent, loan payments or a gym membership.',
 flexible: 'Changes from month to month, such as groceries, eating out and shopping.',
 non_monthly: 'Comes now and then, such as a vacation, car repairs or yearly fees. Save ahead for it.',
};

export type BudgetFigures = Pick<BudgetRow, 'budget' | 'rolloverIn' | 'rolloverMissing' | 'actual' | 'remaining'>;
/** A fund's line for this month: planned, rolled over, spent and available. */
function FundFigures({ figures, currency }: { figures: BudgetFigures; currency: string }) {
 const { t, locale } = useLanguage();
 const money = (value: number) => formatMoney(value, currency, locale);
 return <dl className="budget-left-summary">
  <div><dt>{t('Planned')}</dt><dd>{figures.budget === null ? '—' : money(figures.budget)}</dd></div>
  <div><dt>{t('Rolled over')}</dt><dd>{figures.rolloverMissing ? '—' : formatSignedMoney(figures.rolloverIn, currency, locale)}</dd></div>
  <div><dt>{t('Spent')}</dt><dd>{money(figures.actual)}</dd></div>
  <div className="budget-left-total"><dt>{t('Available')}</dt><dd data-tone={remainingTone(figures.remaining)}>{figures.remaining === null ? '—' : money(figures.remaining)}</dd></div>
 </dl>;
}

/** Category settings: type, rollover and whether the category counts in the budget.
 * The Flexible bucket (flex mode) has only its rollover. `figures` is this month's line: planned, rolled over, spent and available. */
export function CategorySettingsDialog({ category, month, currency, figures, onSave, onClose }: { category: BudgetCategory; month: string; currency: string; figures?: BudgetFigures; onSave: (setting: BudgetCategorySetting) => Promise<void>; onClose: () => void }) {
 const { t } = useLanguage();
 const name = useCategoryName();
 const [type, setType] = useState(category.type);
 const [rollover, setRollover] = useState(category.rollover);
 const [start, setStart] = useState(category.rolloverStart ?? month);
 const [balance, setBalance] = useState(category.rolloverBalance);
 // A starting balance keeps the currency it was saved in until it is changed.
 const [balanceCurrency, setBalanceCurrency] = useState(category.rolloverCurrency ?? currency);
 const [negative, setNegative] = useState(category.rolloverNegative);
 const [excluded, setExcluded] = useState(category.excluded);
 const [busy, setBusy] = useState(false);
 const bucket = category.key === flexBucketKey;
 const expense = category.direction === 'expense' && !bucket;
 const fund = category.direction === 'expense';
 async function submit() {
  setBusy(true);
  try {
   const on = fund && rollover;
   await onSave({ category_key: category.key, budget_type: bucket ? 'flexible' : expense ? type : 'fixed', group_name: null, rollover: on, rollover_start: on ? start : null, excluded: !bucket && excluded,
    rollover_balance: on ? balance : 0, rollover_currency: on && balance ? balanceCurrency : null, rollover_negative: negative });
   onClose();
  } catch (error) { showError(t((error as Error).message)); }
  finally { setBusy(false); }
 }
 return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
  <DialogContent className="budget-dialog">
   <DialogTitle className="budget-dialog-title">{bucket ? <Settings2 size={18}/> : <CategoryIcon kind={category.custom ? category.name : category.key}/>}{bucket ? t('Flexible') : name(category)}</DialogTitle>
   {fund && figures && <FundFigures figures={figures} currency={currency}/>}
   <form onSubmit={event => { event.preventDefault(); submit(); }}>
    <fieldset disabled={busy} className="budget-dialog-fields">
     {expense && <div className="budget-choice-list" role="radiogroup" aria-label={t('Budget type')}>
      <p className="budget-dialog-label">{t('Budget type')}</p>
      {budgetTypes.map(value => <label key={value} className="budget-choice"><input type="radio" name="budget-type" checked={type === value} onChange={() => setType(value)}/><span><strong>{t(budgetTypeLabels[value])}</strong><small>{t(typeHints[value])}</small></span></label>)}
     </div>}
     {fund && <label className="budget-check"><input type="checkbox" checked={rollover} onChange={event => setRollover(event.currentTarget.checked)}/><span><strong>{t('Make this category a rollover fund')}</strong><small>{t('Money left at the end of a month carries into the next one, and overspending is taken from it. Best for non-monthly costs.')}</small></span></label>}
     {fund && rollover && <div className="budget-rollover-fields">
      <label className="budget-dialog-label">{t('Start month')}<DatePicker mode="month" value={start} onChange={setStart}/></label>
      <label className="budget-dialog-label">{t('Starting balance')} ({balanceCurrency})<FormattedNumberInput ariaLabel={t('Starting balance')} value={balance} required={false} displayFractionDigits={0} onValueChange={value => { setBalance(value); setBalanceCurrency(currency); }}/></label>
      <label className="budget-check"><input type="checkbox" checked={negative} onChange={event => setNegative(event.currentTarget.checked)}/><span><strong>{t('Carry overspending into next month')}</strong><small>{t('When off, an overspent month starts the next one at zero.')}</small></span></label>
     </div>}
     {!bucket && <label className="budget-check"><input type="checkbox" checked={excluded} onChange={event => setExcluded(event.currentTarget.checked)}/><span><strong>{t('Exclude this category from the budget')}</strong><small>{t('Its transactions stay recorded, but it is left out of budget totals.')}</small></span></label>}
    </fieldset>
    <FormFooter busy={busy} onCancel={onClose}><Button disabled={busy}>{t(busy ? 'Saving…' : 'Save')}</Button></FormFooter>
   </form>
  </DialogContent>
 </Dialog>;
}

/** Budget settings: Flex or Category style, the default edit scope, and recalculating defaults from history. */
export function BudgetSettingsDialog({ mode, applyForward, onSave, onRecalculate, onClose }: { mode: BudgetMode; applyForward: boolean; onSave: (mode: BudgetMode, applyForward: boolean) => Promise<void>; onRecalculate: () => Promise<void>; onClose: () => void }) {
 const { t } = useLanguage();
 const [style, setStyle] = useState(mode);
 const [forward, setForward] = useState(applyForward);
 const [busy, setBusy] = useState(false);
 async function run(action: () => Promise<void>) {
  setBusy(true);
  try { await action(); onClose(); } catch (error) { showError(t((error as Error).message)); } finally { setBusy(false); }
 }
 return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
  <DialogContent className="budget-dialog">
   <DialogTitle className="budget-dialog-title"><Settings2 size={18}/>{t('Budget settings')}</DialogTitle>
   <form onSubmit={event => { event.preventDefault(); run(() => onSave(style, forward)); }}>
    <fieldset disabled={busy} className="budget-dialog-fields">
     <div className="budget-choice-list" role="radiogroup" aria-label={t('Budget style')}>
      <p className="budget-dialog-label">{t('Budget style')}</p>
      <label className="budget-choice"><input type="radio" name="budget-style" checked={style === 'flex'} onChange={() => setStyle('flex')}/><span><strong>{t('Flex budget')} <span className="status-badge">{t('Recommended')}</span></strong><small>{t('One amount for all flexible spending. Fixed and non-monthly costs are planned on their own.')}</small></span></label>
      <label className="budget-choice"><input type="radio" name="budget-style" checked={style === 'category'} onChange={() => setStyle('category')}/><span><strong>{t('Category budget')}</strong><small>{t('Plan every category on its own, the traditional way.')}</small></span></label>
     </div>
     <div className="budget-choice-list" role="radiogroup" aria-label={t('By default, apply budget changes to')}>
      <p className="budget-dialog-label">{t('By default, apply budget changes to')}</p>
      <label className="budget-choice"><input type="radio" name="budget-scope" checked={!forward} onChange={() => setForward(false)}/><span><strong>{t('This month only')}</strong><small>{t('A change applies to the month you are editing. You can still apply one change to all future months from its History.')}</small></span></label>
      <label className="budget-choice"><input type="radio" name="budget-scope" checked={forward} onChange={() => setForward(true)}/><span><strong>{t('All future months')}</strong><small>{t('A change applies to the month you are editing and every month after it. You can untick this for a single change.')}</small></span></label>
     </div>
     <div className="budget-recalculate">
      <span><strong>{t('Recalculate default budgets')}</strong><small>{t('Sets each category to its six-month average, rounded up to a whole amount, from this month on. Amounts you typed are replaced.')}</small></span>
      <Button type="button" variant="outline" onClick={() => run(onRecalculate)}>{t('Recalculate')}</Button>
     </div>
    </fieldset>
    <FormFooter busy={busy} onCancel={onClose}><Button disabled={busy}>{t(busy ? 'Saving…' : 'Save')}</Button></FormFooter>
   </form>
  </DialogContent>
 </Dialog>;
}

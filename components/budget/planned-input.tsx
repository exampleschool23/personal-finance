"use client";
import { useRef, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import type { BudgetHistory, BudgetRow } from '@/lib/budget';
import { showError } from '@/lib/feedback';
import { formatMoney, formatMonthShort } from '@/lib/format';

/** History popover: last month, the monthly average and six monthly bars. */
function HistoryPanel({ history, direction, currency, amount, forward, onForward }: { history: BudgetHistory; direction: BudgetRow['direction']; currency: string; amount: number; forward: boolean; onForward: (value: boolean) => void }) {
 const { t, locale } = useLanguage();
 const peak = Math.max(...history.months.map(item => item.amount), 1);
 return <div className="budget-history">
  <p className="budget-history-title">{t('History')}</p>
  <div className="budget-history-tiles">
   <div><strong>{formatMoney(history.lastMonth, currency, locale)}</strong><span>{t(direction === 'income' ? 'Earned last month' : 'Spent last month')}</span></div>
   <div><strong>{formatMoney(history.average, currency, locale)}</strong><span>{t('Monthly average')}</span></div>
  </div>
  <ol className="budget-history-bars" data-direction={direction}>
   {history.months.map(item => <li key={item.month} title={formatMoney(item.amount, currency, locale)}><span style={{ height: `${Math.max(2, item.amount / peak * 100)}%` }}/><small>{formatMonthShort(item.month, locale)}</small></li>)}
  </ol>
  <label className="budget-history-forward"><input type="checkbox" checked={forward} onChange={event => onForward(event.currentTarget.checked)}/>{t('Apply {amount} to all future months', { amount: formatMoney(amount, currency, locale) })}</label>
 </div>;
}

/** An editable planned amount. Focusing it opens the History popover; leaving it saves. */
export function PlannedInput({ label, value, history, direction, currency, defaultForward, onSave }: { label: string; value: number; history: BudgetHistory; direction: BudgetRow['direction']; currency: string; defaultForward: boolean; onSave: (amount: number, forward: boolean) => Promise<void> }) {
 const { t } = useLanguage();
 const anchor = useRef<HTMLSpanElement>(null);
 const [open, setOpen] = useState(false);
 const [draft, setDraft] = useState(value);
 const [forward, setForward] = useState(defaultForward);
 function commit() {
  setOpen(false);
  const changed = draft !== value || forward !== defaultForward;
  setForward(defaultForward);
  if (changed) onSave(draft, forward).catch(error => { setDraft(value); showError(t((error as Error).message || 'Could not save changes.')); });
 }
 return <Popover open={open} onOpenChange={next => { if (!next) commit(); }}>
  <PopoverAnchor asChild>
   <span ref={anchor} className="budget-input" onFocus={() => setOpen(true)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); (event.target as HTMLElement).blur(); } }}>
    <FormattedNumberInput ariaLabel={label} value={draft} onValueChange={next => setDraft(next)} required={false} displayFractionDigits={0}/>
   </span>
  </PopoverAnchor>
  <PopoverContent className="budget-history-popover" align="end" onOpenAutoFocus={event => event.preventDefault()} onInteractOutside={event => { if (anchor.current?.contains(event.target as Node)) event.preventDefault(); }}>
   <HistoryPanel history={history} direction={direction} currency={currency} amount={draft} forward={forward} onForward={setForward}/>
  </PopoverContent>
 </Popover>;
}

"use client";
import { ArrowLeft, Minus, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { CurrencySelect } from '@/components/presentation-foundation/currency-select';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import type { Entry } from '@/lib/finance';
import { formatDate, formatMoney, formatMonthYear, formatNumber } from '@/lib/format';
import { goalEmoji } from '@/lib/goal-emoji';
import { goalStatus, goalSummary, reachedIn } from '@/lib/goal-projection';
import { alreadyAdded, canContinue, draftProblems, goalAccountOptions, goalSetupSteps, goalTemplates, maxPerTemplate, monthlyTotals, pickTemplate, savingsCurrencies, setupDrafts, withSavingsCurrency, type SetupDraft } from '@/lib/goal-setup';
import type { Goal } from '@/lib/planning';
import { GoalSummaryRow } from './goal-summary-row';

const stepLabels = { select: 'Select', targets: 'Targets', contribution: 'Contribution', budget: 'Budget' } as const;

type Props = { goals: Goal[]; accounts: Entry[]; currency: string; currencies: string[]; netWorth: (currency: string) => number | null; today: string; maxDate: string; save: (action: string, data: unknown) => Promise<void>; onClose: () => void; onCreated: (ids: string[]) => void; onInvestment: () => void };

/** Add-goal flow: pick goals from tiles, set targets, add what is already saved, then plan the monthly amount.
 * `currency` is the primary currency every new goal starts in. */
export function GoalSetupFlow({ goals, accounts, currency, currencies, netWorth, today, maxDate, save, onClose, onCreated, onInvestment }: Props) {
 const { t, locale } = useLanguage();
 const [step, setStep] = useState(0), [counts, setCounts] = useState<Record<string, number>>({}), [drafts, setDrafts] = useState<SetupDraft[]>([]);
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [touched, setTouched] = useState(false);
 const name = goalSetupSteps[step];
 const list = drafts.map(draft => draft.goal);
 const ready = name === 'select' ? Object.values(counts).some(count => count > 0) : canContinue(list, name, today);
 const money = (amount: number, code: string | undefined) => formatMoney(amount, code || currency, locale);
 const update = (id: string, patch: Partial<Goal>) => setDrafts(previous => previous.map(draft => draft.goal.id === id ? { ...draft, goal: { ...draft.goal, ...patch } } : draft));
 const current = (goal: Goal) => goal.kind === 'net_worth' ? netWorth(goal.currency ?? currency) : Number(goal.allocated);

 async function next() {
  if (!ready) { setTouched(true); return; }
  setTouched(false); setError('');
  if (name === 'select') {
   setDrafts(setupDrafts(counts, template => t(template.name), { currency, accounts }, () => crypto.randomUUID(), drafts));
   setStep(1); return;
  }
  if (name !== 'budget') { setStep(step + 1); return; }
  await create(list);
 }
 // Goals are saved one by one; a retry saves the same ids again, so nothing is created twice.
 async function create(goals: Goal[]) {
  setBusy(true); setError('');
  try { for (const goal of goals) await save('goal', goal); onCreated(goals.map(goal => goal.id)); }
  catch (reason) { setError((reason as Error).message); }
  finally { setBusy(false); }
 }
 function skip() {
  setTouched(false);
  if (name === 'budget') { void create(list.map(goal => ({ ...goal, monthly_contribution: null }))); return; }
  setDrafts(drafts.map(draft => ({ ...draft, goal: { ...draft.goal, allocated: 0 } })));
  setStep(step + 1);
 }

 const preview = <aside className="goal-setup-preview" aria-label={t('Goals')}>
  <h2>{t('Goals')}</h2>
  <ul>{list.map(goal => {
   const value = current(goal), summary = goalSummary(goal, value, today);
   return <li key={goal.id}><GoalSummaryRow emoji={goalEmoji(goal)} name={goal.name || t('Goal')} status={goal.target > 0 ? goalStatus(summary) : null} percent={summary.percent}
    amount={value === null ? '—' : money(value, goal.currency)} meta={goal.target_date ? formatDate(goal.target_date, locale) : t('No target date')}
    detail={goal.target > 0 ? t('{amount} target', { amount: money(goal.target, goal.currency) }) : '—'}/></li>;
  })}</ul>
 </aside>;
 const problems = (goal: Goal) => touched ? draftProblems(goal, name, today) : [];

 return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
  <DialogContent className="goal-setup top-0 left-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none" showCloseButton={false}>
   <header className="goal-setup-bar">
    {step ? <Button variant="ghost" size="icon" disabled={busy} aria-label={t('Back')} onClick={() => { setTouched(false); setStep(step - 1); }}><ArrowLeft size={18} aria-hidden="true"/></Button> : <span className="goal-setup-spacer"/>}
    <DialogTitle className="sr-only">{t('Add goal')}</DialogTitle><DialogDescription className="sr-only">{t(stepLabels[name])}</DialogDescription>
    <ol className="goal-setup-steps">{goalSetupSteps.map((each, index) => <li key={each} aria-current={index === step ? 'step' : undefined}>
     {index < step ? <button type="button" disabled={busy} onClick={() => { setTouched(false); setStep(index); }}>{t(stepLabels[each])}</button> : <span>{t(stepLabels[each])}</span>}
    </li>)}</ol>
    <Button variant="ghost" size="icon" disabled={busy} aria-label={t('Close')} onClick={onClose}><X size={18} aria-hidden="true"/></Button>
   </header>
   <div className="goal-setup-progress" aria-hidden="true"><span style={{ width: `${(step + 1) / goalSetupSteps.length * 100}%` }}/></div>

   <div className="goal-setup-body">
    {name === 'select' && <section className="goal-setup-select">
     <h1>{t('Select goals to add')}</h1>
     {!accounts.length && <p className="goal-funding-notice">{t('Savings goals keep money in a cash account. Add one first, or pick a net-worth goal.')} <Link href="/accounts">{t('Accounts')}</Link></p>}
     <ul className="goal-template-grid">{goalTemplates.map(template => {
      const count = counts[template.id] ?? 0, added = alreadyAdded(template, goals);
      const disabled = template.kind === 'savings' && !accounts.length;
      const set = (value: number) => setCounts(pickTemplate(counts, template.id, value));
      return <li key={template.id} className="goal-template" data-selected={count > 0 || undefined} data-disabled={disabled || undefined}>
       <button type="button" className="goal-template-pick" disabled={disabled} aria-pressed={template.kind === 'investment' ? undefined : count > 0} onClick={() => template.kind === 'investment' ? onInvestment() : set(count ? 0 : 1)}>
        <span className="goal-row-cover" aria-hidden="true">{template.emoji}</span>
        <span><strong>{t(template.name)}</strong>{added > 0 && <small>{t(added === 1 ? '1 goal already added' : '{count} goals already added', { count: formatNumber(added, locale, 0) })}</small>}</span>
       </button>
       {count > 0 && <span className="goal-template-count"><Button variant="ghost" size="icon" aria-label={t('Fewer {name} goals', { name: t(template.name) })} onClick={() => set(count - 1)}><Minus size={15} aria-hidden="true"/></Button><output aria-live="polite">{formatNumber(count, locale, 0)}</output><Button variant="ghost" size="icon" disabled={count >= maxPerTemplate} aria-label={t('More {name} goals', { name: t(template.name) })} onClick={() => set(count + 1)}><Plus size={15} aria-hidden="true"/></Button></span>}
      </li>;
     })}</ul>
    </section>}

    {name === 'targets' && <section className="goal-setup-single">
     <h1>{t('Set your targets')}</h1>
     {list.map(goal => <article key={goal.id} className="panel goal-setup-card">
      <header><span className="goal-row-cover" aria-hidden="true">{goalEmoji(goal)}</span><label className="goal-setup-name">{t('Name')}<Input required maxLength={120} value={goal.name} onChange={event => update(goal.id, { name: event.target.value })}/></label></header>
      <div className="goal-setup-fields">
       <label>{t('Target amount')} ({goal.currency})<FormattedNumberInput max={1e15} value={goal.target} onValueChange={target => update(goal.id, { target, allocated: Math.min(goal.allocated, target) })}/></label>
       <label>{t(goal.kind === 'net_worth' ? 'Target date' : 'Target date (optional)')}<DatePicker required={goal.kind === 'net_worth'} value={goal.target_date ?? ''} min={today} max={maxDate} onChange={date => update(goal.id, { target_date: date || null })}/></label>
       {goal.kind === 'net_worth' ? <CurrencySelect value={goal.currency ?? currency} currencies={currencies} onChange={code => update(goal.id, { currency: code })}/>
       : <CurrencySelect value={goal.currency ?? currency} currencies={savingsCurrencies(accounts, currencies)} onChange={code => setDrafts(previous => previous.map(draft => draft.goal.id === goal.id ? { ...draft, goal: withSavingsCurrency(draft.goal, code, accounts) } : draft))}/>}
      </div>
      {problems(goal).map(problem => <p key={problem} role="alert" className="goal-row-alert">{t(problem)}</p>)}
     </article>)}
    </section>}

    {name === 'contribution' && <div className="goal-setup-split">
     <section>
      <h1>{t('Add funds you have already saved')}</h1>
      {list.map(goal => <article key={goal.id} className="panel goal-setup-card">
       <header><span className="goal-row-cover" aria-hidden="true">{goalEmoji(goal)}</span><strong>{goal.name}</strong></header>
       {goal.kind === 'net_worth' ? <p className="goal-setup-note">{t('Starts from your current net worth: {amount}', { amount: netWorth(goal.currency ?? currency) === null ? '—' : money(netWorth(goal.currency ?? currency)!, goal.currency) })}</p>
       : <div className="goal-setup-fields">
        <label>{t('Cash account')}<NativeSelect required value={goal.account_id ?? ''} onChange={event => update(goal.id, { account_id: event.target.value || null })}>{goalAccountOptions(accounts, goal.currency).map(item => <option key={item.id} value={item.id}>{item.name} · {money(item.amount, item.currency)}</option>)}</NativeSelect></label>
        <label>{t('Already saved')} ({goal.currency})<FormattedNumberInput required={false} value={goal.allocated} max={goal.target || 1e15} onValueChange={allocated => update(goal.id, { allocated })}/></label>
       </div>}
       {/* Already saved may exceed the account balance; Accounts then shows a negative Available amount. */}
       {problems(goal).map(problem => <p key={problem} role="alert" className="goal-row-alert">{t(problem)}</p>)}
      </article>)}
     </section>
     {preview}
    </div>}

    {name === 'budget' && <div className="goal-setup-split">
     <section>
      <h1>{t('How much will you put toward your goals each month?')}</h1>
      <p className="goal-setup-total"><span>{t('Monthly planned contributions')}</span><strong>{monthlyTotals(list).map(item => money(item.amount, item.currency)).join(' · ')}</strong></p>
      {list.map(goal => {
       const { needed, left } = goalSummary(goal, current(goal), today);
       // Without a target date there is no monthly amount to suggest; the amount typed shows when the goal is reached.
       const reached = goal.target_date ? null : reachedIn(left, Number(goal.monthly_contribution ?? 0), today);
       return <article key={goal.id} className="panel goal-setup-card">
        <header><span className="goal-row-cover" aria-hidden="true">{goalEmoji(goal)}</span><strong>{goal.name}</strong></header>
        <div className="goal-setup-fields">
         <label>{t('Monthly contribution')} ({goal.currency})<FormattedNumberInput required={false} value={goal.monthly_contribution ?? 0} onValueChange={monthly => update(goal.id, { monthly_contribution: monthly })}/></label>
         <div className="goal-setup-needed">{needed !== null && needed > 0 ? <><span>{t('{amount} a month needed', { amount: money(needed, goal.currency) })}</span><Button type="button" variant="outline" size="sm" onClick={() => update(goal.id, { monthly_contribution: needed })}>{t('Use this amount')}</Button></> : <span>{reached ? t('At this amount, reached in {month}', { month: formatMonthYear(reached, locale) }) : t(needed === 0 ? 'Target already reached' : 'Add a target date to see what is needed each month.')}</span>}</div>
        </div>
       </article>;
      })}
     </section>
     {preview}
    </div>}
   </div>

   <footer className="goal-setup-footer">
    <ErrorPopup message={error}/>
    {(name === 'contribution' || name === 'budget') && <Button variant="ghost" disabled={busy || !canContinue(list, 'targets', today)} onClick={skip}>{t('Skip')}</Button>}
    <Button disabled={busy} aria-disabled={!ready || undefined} title={!ready && name === 'select' ? t('Select goals to add') : undefined} onClick={() => void next()}>{t(busy ? 'Saving…' : name === 'budget' ? (list.length === 1 ? 'Create goal' : 'Create goals') : 'Continue')}</Button>
   </footer>
  </DialogContent>
 </Dialog>;
}

"use client";

import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { useId, useState } from 'react';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { ResourceState } from '@/components/presentation-foundation/resource-state';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { ChevronDown, History, Plus, SlidersHorizontal } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { useUnsavedNavigation } from '@/components/discard-changes';
import { formatMoney, formatDate } from '@/lib/format';
import { income } from '@/lib/finance';
import { fundingPlan, type GoalEvent } from '@/lib/goal-funding';
import { emptyPlanning,type Goal,type PlanningData } from '@/lib/planning';
import { useOwnerResource, saveOwnerResource } from '@/hooks/use-owner-resource';
import { RollingText } from '@/components/presentation-foundation/rolling-text';

const empty = { events: [] as GoalEvent[] };
type Props = { data: PlanningData; currency: string; surplus: number | null; today: string; rates?: Record<string, number>; owner: string | null; demo: boolean; revision: number; onSaved: () => void;
 /** One of the two panels: what is free for goals (on the page) or the cash goal activity (in the History window). Both when left out. */
 part?: 'funding' | 'activity' };

export function GoalFundingPanel({ data, currency, surplus, today, rates, owner, demo, revision, onSaved, part }: Props) {
 const { t, locale } = useLanguage();
 const savingsGoals = data.goals.filter(goal => (goal.kind ?? 'savings') === 'savings');
 const activeSavings = savingsGoals.filter(goal => !goal.archived);
 const activeGoals = data.goals.filter(goal => !goal.archived);
 const activity = useOwnerResource('/api/goal-tools', owner, !demo && savingsGoals.length > 0, revision, empty);
 const plan = fundingPlan(data.goals, surplus, currency, today, rates);
 const [busy, setBusy] = useState(false), [error, setError] = useState('');
 const [activityOpen, setActivityOpen] = useState(false), [planning, setPlanning] = useState(false);
 const incomeHistory=useOwnerResource('/api/planning?scope=insights',owner,!demo&&activityOpen,revision,emptyPlanning);
 const events = activity.data.events.filter(event => event.event_type !== 'opening' || Number(event.delta) !== 0);
 const activityId = useId();
 const money = (value: number | null) => value === null ? '—' : formatMoney(value, currency, locale);

 async function save(action: string, payload: unknown) {
  if (demo) throw Error(t('Sign in to save planning changes.'));
  setBusy(true); setError('');
  try { await saveOwnerResource('/api/goal-tools', action, payload); activity.invalidate(); onSaved(); }
  catch (reason) { setError((reason as Error).message); throw reason; }
  finally { setBusy(false); }
 }

 if (!activeGoals.length && !savingsGoals.length) return null;
 // One activity row; the panel and the full history share it.
 const activityRow = (event: (typeof events)[number]) => {
  const goal = savingsGoals.find(item => item.id === event.goal_id);
  return <li key={event.id}><div><strong>{goal?.name ?? t('Goal')}</strong><small>{formatDate(event.occurred_on, locale)} · {t(event.event_type)}{event.source_name && ` · ${event.source_name}`}</small>{event.notes && <small>{event.event_type === 'opening' ? t(event.notes) : event.notes}</small>}</div><strong className="goal-activity-amount">{formatMoney(Number(event.delta), goal?.currency ?? currency, locale)}</strong></li>;
 };
 // Goals sidebar: what is free for goals this month, the plan that uses it, and the money moved in and out of goals.
 return <>
  {part !== 'activity' && activeGoals.length > 0 && <section className="panel goal-funding-panel" aria-labelledby={`${activityId}-funding`}>
   <PanelTitle title={<span id={`${activityId}-funding`}>{t('Available for goals')}</span>} hint={t('Plan how to divide your monthly surplus between goals. Money stays in your accounts until you move it.')}/>
   <div className="goal-available"><strong><RollingText text={money(plan.remaining)}/></strong><span>{t('Unassigned monthly surplus')}</span></div>
   <dl className="goal-funding-figures">
    <div><dt>{t('Available monthly surplus')}</dt><dd>{money(surplus)}</dd></div>
    <div><dt>{t('Planned goal funding')}</dt><dd>{money(plan.requested)}</dd></div>
   </dl>
   {plan.shortfall !== null && plan.shortfall > 0 && <p className="goal-funding-notice negative" role="status">{t('Your funding plan exceeds your monthly surplus by {amount}.', { amount: money(plan.shortfall) })}</p>}
   {!plan.complete && <p className="goal-funding-notice" role="status">{t('Enter each enabled goal’s monetary budget and provide all exchange rates to complete the plan.')}</p>}
   {plan.rows.length > 0 && <ul className="goal-funding-allocations" aria-label={t('Planned goal funding')}>
    {plan.rows.map(row => <li key={row.goal.id}><span>{row.goal.name}</span><strong>{money(row.allocated)}</strong></li>)}
   </ul>}
   <Button type="button" className="goal-funding-plan" onClick={() => setPlanning(true)}><SlidersHorizontal size={16} aria-hidden="true"/>{t('Plan funding')}</Button>
   <Dialog open={planning} onOpenChange={setPlanning}><DialogContent className="record-dialog goal-funding-dialog">
    <DialogTitle className="goal-dialog-title">{t('Priorities and monthly funding')}<InfoHint>{t('Lower priority numbers are funded first. Include only separate commitments so the same money is not planned twice.')}</InfoHint></DialogTitle>
    <div className="goal-funding-editors">{activeGoals.map(goal => <FundingEditor key={JSON.stringify(goal)} goal={goal} today={today} busy={busy || demo} save={save}/>)}</div>
   </DialogContent></Dialog>
  </section>}
  {part !== 'funding' && savingsGoals.length > 0 && <section className="panel goal-cash-activity" aria-labelledby={activityId}>
   <PanelTitle title={<span id={activityId}>{t('Cash goal activity')}</span>} hint={t('Contributions, withdrawals and transfers for your cash savings goals.')}>
    {activeSavings.length > 0 && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setActivityOpen(true)}><Plus size={16} aria-hidden="true"/>{t('Record')}</Button>}
   </PanelTitle>
   {activeSavings.length > 0 && <Dialog open={activityOpen} onOpenChange={setActivityOpen}><DialogContent className="record-dialog sm:max-w-2xl">
    <DialogTitle>{t('Record goal activity')}</DialogTitle>
    {demo && <p className="goal-funding-notice" role="status">{t('Sign in to record cash goal activity.')}</p>}
    <ResourceState loading={activityOpen&&incomeHistory.loading} error={activityOpen?incomeHistory.error:null} onRetry={incomeHistory.retry}><GoalActivityForm data={demo||!activityOpen?data:{...data,records:incomeHistory.data.records}} goals={activeSavings} today={today} busy={busy || demo} save={save}/></ResourceState>
   </DialogContent></Dialog>}
   {activity.error ? <InlineError as="div" className="goal-funding-notice" message={<p>{t('Goal activity could not be loaded. Please try again.')}</p>} onRetry={activity.retry}/>
    : activity.loading ? <LoadingPlaceholder label={t('Loading goal activity…')} rows={2}/>
    : events.length > 0 ? <ul className="goal-activity-list">{events.map(activityRow)}</ul>
    : <EmptyState icon={<History aria-hidden="true"/>} description={t('Cash contributions, withdrawals and transfers will appear here when recorded.')}/>}
  </section>}
  <ErrorPopup message={error}/>
 </>;
}


function FundingEditor({ goal, today, busy, save }: { goal: Goal; today: string; busy: boolean; save: (action: string, data: unknown) => Promise<void> }) {
 const { t, locale } = useLanguage(); const id = useId();
 const initial = { goal_id: goal.id, priority: goal.funding_priority ?? 100, monthly: goal.funding_monthly ?? null, enabled: goal.funding_enabled ?? false, paused_until: goal.paused_until ?? null, mode: goal.funding_mode ?? 'one_time' };
 const [draft, setDraft] = useState(initial), [saved, setSaved] = useState(initial);
 const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
 const guard = useUnsavedNavigation(dirty);
 const monthly = draft.monthly ?? (goal.kind === 'investment' ? 0 : goal.monthly_contribution ?? 0);
 return <form className="goal-funding-editor" aria-labelledby={`${id}-title`} onSubmit={async event => {
  event.preventDefault(); if (busy || !dirty || !Number.isInteger(draft.priority)) return;
  try { await save('funding', draft); setSaved(draft); } catch { /* Shared save feedback stays visible in the panel. */ }
 }}>
  <header><h3 id={`${id}-title`}>{goal.name}</h3><p className="muted">{t(goal.kind === 'investment' ? 'Stock / crypto accumulation' : goal.kind === 'net_worth' ? 'Net-worth goal' : 'Savings goal')} · {goal.currency}</p></header>
  <fieldset disabled={busy} className="goal-funding-controls" aria-labelledby={`${id}-title`}>
   <label className="goal-funding-enable" htmlFor={`${id}-enabled`}><Checkbox id={`${id}-enabled`} checked={draft.enabled} onCheckedChange={enabled => setDraft({ ...draft, enabled: enabled === true })}/><span>{t('Include in monthly funding')}</span></label>
   <div className="goal-funding-fields">
    <label>{t('Monthly funding budget')} ({goal.currency})<FormattedNumberInput value={monthly} required={false} onValueChange={value => setDraft({ ...draft, monthly: value })}/></label>
    <label>{t('Priority')}<FormattedNumberInput value={draft.priority} max={10000} required={false} onValueChange={priority => setDraft({ ...draft, priority })}/></label>
   </div>
   <details className="goal-funding-advanced"><summary><span>{t('More funding options')}</span><ChevronDown className="goal-disclosure-chevron" size={16} aria-hidden="true"/></summary>
    <div className="goal-funding-fields">
     <label>{t('Pause through')}<DatePicker value={draft.paused_until ?? ''} min={today} required={false} onChange={value => setDraft({ ...draft, paused_until: value || null })}/></label>
     {(goal.kind ?? 'savings') === 'savings' && <label>{t('Goal behavior')}<NativeSelect value={draft.mode} onChange={event => setDraft({ ...draft, mode: event.target.value as 'one_time' | 'refill' })}><option value="one_time">{t('One-time target')}</option><option value="refill">{t('Refill after withdrawals')}</option></NativeSelect></label>}
    </div>
   </details>
  </fieldset>
  <footer className="goal-funding-editor-footer"><span className="muted" role="status">{dirty ? t('Unsaved changes') : saved.paused_until && saved.paused_until >= today ? t('Paused through {date}', { date: formatDate(saved.paused_until, locale) }) : t(saved.enabled ? 'Funding enabled' : 'Funding not enabled')}</span><div>{dirty && <Button type="button" variant="ghost" disabled={busy} onClick={() => setDraft(saved)}>{t('Reset changes')}</Button>}<Button type="submit" aria-label={t('Save funding for {name}', { name: goal.name })} disabled={busy || !dirty || !Number.isInteger(draft.priority)}>{t('Save')}</Button></div></footer>
  {guard}
 </form>;
}

function GoalActivityForm({ data, goals, today, busy, save }: { data: PlanningData; goals: Goal[]; today: string; busy: boolean; save: (action: string, data: unknown) => Promise<void> }) {
 const { t, locale } = useLanguage();
 const [goalId, setGoalId] = useState(goals[0]?.id ?? ''), [type, setType] = useState('contribution'), [amount, setAmount] = useState(0), [target, setTarget] = useState(''), [source, setSource] = useState(''), [date, setDate] = useState(today), [notes, setNotes] = useState('');
 const [operation, setOperation] = useState<string | null>(null);
 const goal = goals.find(item => item.id === goalId);
 const linked = type === 'contribution' ? data.records.find(record => record.id === source) : undefined;
 const exceedsIncome = !!linked && amount > Number(linked.amount);
 const guard = useUnsavedNavigation(amount > 0 || !!notes); const locked = busy || !!operation;
 return <form className="goal-activity-form" onSubmit={async event => {
  event.preventDefault(); if (busy || !goal || amount <= 0 || exceedsIncome) return;
  const id = operation ?? crypto.randomUUID(); setOperation(id);
  try { await save('activity', { id, goal_id: goalId, target_id: type === 'transfer' ? target : null, source_id: type === 'contribution' ? source || null : null, amount, date, type, notes }); setAmount(0); setNotes(''); setOperation(null); }
  catch (reason) { if ((reason as { confirmedFailure?: boolean }).confirmedFailure) setOperation(null); }
 }}>
  <p className="muted">{t('Reserve or release money already in the account. This does not transfer bank funds.')}</p>
  <fieldset className="goal-funding-fields" disabled={locked} aria-label={t('Record goal activity')}>
   <label>{t('Goal')}<NativeSelect value={goalId} onChange={event => { setGoalId(event.target.value); setTarget(''); setSource(''); }}>{goals.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></label>
   <label>{t('Type')}<NativeSelect value={type} onChange={event => setType(event.target.value)}>{['contribution', 'withdrawal', 'transfer'].map(value => <option key={value} value={value}>{t(value)}</option>)}</NativeSelect></label>
   <label>{t('Amount')} {goal?.currency}<FormattedNumberInput value={amount} onValueChange={setAmount}/></label>
   <label>{t('Date')}<DatePicker value={date} max={today} onChange={value => { setDate(value); setSource(''); }}/></label>
   {type === 'transfer' && <label>{t('Destination goal')}<NativeSelect required value={target} onChange={event => setTarget(event.target.value)}><option value="">{t('Select goal')}</option>{goals.filter(item => item.id !== goalId && item.account_id === goal?.account_id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></label>}
   {type === 'contribution' && <label>{t('Link income (optional)')}<NativeSelect value={source} onChange={event => setSource(event.target.value)}><option value="">{t('None')}</option>{data.records.filter(record => record.account_id === goal?.account_id && record.currency === goal?.currency && record.date <= date && record.frequency === 'Once' && income.includes(record.kind)).map(record => <option key={record.id} value={record.id}>{record.name} · {formatMoney(record.amount, record.currency, locale)}</option>)}</NativeSelect>{exceedsIncome && linked && <small className="negative" role="alert">{t('Enter no more than the linked income: {amount}.', { amount: formatMoney(Number(linked.amount), linked.currency, locale) })}</small>}</label>}
   <label className="goal-field-wide">{t('Notes (optional)')}<Input value={notes} maxLength={2000} onChange={event => setNotes(event.target.value)}/></label>
  </fieldset>
  <div className="goal-activity-actions"><Button type="submit" disabled={busy || !goal || amount <= 0 || exceedsIncome || type === 'transfer' && !target}>{t(operation ? 'Retry' : 'Save')}</Button>{operation && !busy && <Button type="button" variant="outline" onClick={() => setOperation(null)}>{t('Edit details after checking activity')}</Button>}</div>
  {operation && !busy && <p className="muted">{t('Check goal activity before changing a request whose result is uncertain. Retry keeps the same operation identifier.')}</p>}
  {guard}
 </form>;
}

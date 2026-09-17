"use client";

import { useId, useMemo, useState, type CSSProperties } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { ArrowUpRight, Check, ChevronDown, CircleHelp, RotateCcw, Save, SlidersHorizontal, Target, TrendingUp, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormattedNumberInput } from '@/components/formatted-number-input';
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMoney, formatMonthYear, formatNumber } from '@/lib/format';
import { projectGoal } from '@/lib/goal-projection';
import type { Goal } from '@/lib/planning';
import { snapshotPoints, type PortfolioSnapshot } from '@/lib/portfolio-snapshots';

type Props = {
 goal: Goal; starting: number | null; surplus: number | null; currency: string; today: string;
 snapshots: PortfolioSnapshot[]; historyError: string;
 save: (action: string, data: unknown) => Promise<void>; onEdit: () => void;
};

export function GoalForecast({ goal, starting, surplus, currency, today, snapshots, historyError, save, onEdit }: Props) {
 const { t, locale } = useLanguage();
 const id = useId();
 const [monthly, setMonthly] = useState<number | null>(goal.monthly_contribution ?? null);
 const [rate, setRate] = useState(Number(goal.annual_return ?? 0));
 const [savedPlan, setSavedPlan] = useState({ monthly: goal.monthly_contribution ?? null, rate: Number(goal.annual_return ?? 0) });
 const [busy, setBusy] = useState(false), [error, setError] = useState('');
 const [hidden, setHidden] = useState<string[]>([]), [view, setView] = useState<'chart' | 'table'>('chart');
 const dirty = monthly !== savedPlan.monthly || rate !== savedPlan.rate;
 const contribution = monthly ?? (surplus === null ? null : Math.max(0, surplus));
 const result = useMemo(() => starting !== null && contribution !== null && goal.target_date
  ? projectGoal(starting, goal.target, today, goal.target_date, contribution, rate) : null,
 [starting, contribution, goal.target, goal.target_date, today, rate]);
 const money = (n: number) => formatMoney(n, currency, locale);
 const percent = (n: number) => `${formatNumber(n, locale, 2)}%`;
 const history = useMemo(() => goal.kind === 'net_worth'
  ? snapshotPoints(snapshots, currency).filter(point => point.date < today).map(point => ({ date: point.date, actual: point.net })) : [],
 [goal.kind, snapshots, currency, today]);
 const points = useMemo(() => [...history, ...(result?.points ?? []).map((point, i) => ({ ...point, actual: i === 0 ? starting : null }))]
  .map(point => ({ ...point, time: Date.parse(point.date + 'T00:00:00Z') })), [history, result, starting]);
 const lines = [
  { key: 'actual', label: goal.kind === 'net_worth' ? (history.length ? 'Actual net worth' : 'Actual net worth today') : 'Allocated amount', color: 'var(--foreground)' },
  { key: 'projected', label: 'Your projected path', color: 'var(--primary)' },
  { key: 'required', label: 'Path to your goal', color: 'var(--chart-2)', dash: '6 4' },
  { key: 'target', label: 'Target amount', color: 'var(--muted-foreground)', dash: '3 5' },
 ];
 const isoDate = (time: number) => new Date(time).toISOString().slice(0, 10);
 const reached = result !== null && result.projected >= goal.target - 0.01;
 const progress = result ? Math.max(0, Math.min(100, result.projected / goal.target * 100)) : 0;
 const overBudget = contribution !== null && surplus !== null ? Math.max(0, contribution - Math.max(0, surplus)) : 0;
 // Quick-fill chooses a whole amount that still meets the target; typed amounts retain their precision.
 const requiredContribution = result?.required == null ? null : Math.ceil(result.required);
 const monthlyMax = Math.min(1e15, Math.max(1000, Math.ceil(Math.max((requiredContribution ?? 0) * 1.5, (surplus ?? 0) * 2, contribution ?? 0) / 1000) * 1000));
 const rangeStyle = (value: number, max: number) => ({ '--range-progress': `${Math.min(100, value / max * 100)}%` } as CSSProperties);
 const savePlan = async () => {
  setBusy(true); setError('');
  try {
   await save('goal', { ...goal, monthly_contribution: monthly, annual_return: rate });
   setSavedPlan({ monthly, rate });
  } catch (reason) { setError((reason as Error).message); }
  finally { setBusy(false); }
 };

 return <section className="panel goal-forecast" aria-labelledby={`${id}-title`}>
  <header className="goal-planner-header">
   <div className="goal-planner-heading"><span className="goal-planner-icon"><Target size={22} aria-hidden="true" /></span><div><p className="eyebrow">{t('Goal planner')}</p><h2 id={`${id}-title`}>{goal.name}</h2><p className="muted">{goal.target_date ? t('Target date') + ': ' + formatDate(goal.target_date, locale) : t('Choose a target date to see your plan.')}</p></div></div>
   <Button variant="outline" onClick={onEdit} disabled={busy}>{t('Edit goal')}</Button>
  </header>

  <div className="goal-planner-layout">
   <aside className="goal-scenario" aria-labelledby={`${id}-scenario`}>
    <div className="goal-section-heading"><SlidersHorizontal size={18} aria-hidden="true" /><h3 id={`${id}-scenario`}>{t('Shape your plan')}</h3><span className="goal-live-badge">{t('Live')}</span></div>
    <p className="goal-help">{t('Adjust the numbers to explore your future.')}</p>
    <fieldset className="goal-scenario-fields" disabled={busy || goal.archived}>
     <div className="goal-control">
      <label className="goal-input-label">{t('Monthly investment')}<span className="goal-amount-input"><FormattedNumberInput value={contribution ?? 0} displayFractionDigits={0} required={false} onValueChange={setMonthly} /><span>{currency}</span></span></label>
      <input className="goal-range" type="range" min={0} max={monthlyMax} step="any" value={contribution ?? 0} style={rangeStyle(contribution ?? 0, monthlyMax)} aria-label={t('Monthly investment')} aria-valuetext={contribution === null ? t('Surplus is unavailable. Enter a monthly investment to explore a scenario.') : money(contribution)} onChange={event => setMonthly(Math.round(Number(event.target.value)))} />
      <div className="goal-range-labels"><span>{money(0)}</span><span>{money(monthlyMax)}</span></div>
      <div className="goal-quick-actions"><Button type="button" variant={monthly === null ? 'secondary' : 'outline'} aria-pressed={monthly === null} disabled={surplus === null} onClick={() => setMonthly(null)}><Wallet size={14} aria-hidden="true" />{t('Use my surplus')}</Button><Button type="button" variant="outline" disabled={requiredContribution === null || requiredContribution > 1e15} onClick={() => { if (requiredContribution !== null) setMonthly(requiredContribution); }}>{t('Use required contribution')}</Button></div>
     </div>

     <div className="goal-control">
      <label className="goal-input-label">{t('Assumed annual return')}<span className="goal-amount-input"><FormattedNumberInput value={rate} max={100} required={false} onValueChange={setRate} /><span>%</span></span></label>
      <input className="goal-range" type="range" min={0} max={100} step={0.5} value={rate} style={rangeStyle(rate, 100)} aria-label={t('Assumed annual return')} aria-valuetext={percent(rate)} onChange={event => setRate(Number(event.target.value))} />
      <div className="goal-rate-presets" role="group" aria-label={t('Return presets')}>{[0, 5, 8, 12].map(preset => <button type="button" key={preset} aria-pressed={rate === preset} onClick={() => setRate(preset)}>{percent(preset)}</button>)}</div>
      <p className="goal-help">{t('Applies to new monthly investments. Returns are assumptions, not guarantees.')}</p>
     </div>
    </fieldset>

    <div className="goal-cash-context"><div><Wallet size={17} aria-hidden="true" /><span>{t('Available monthly surplus')}</span></div><strong>{surplus === null ? '—' : money(surplus)}</strong><details><summary>{t('How is this calculated?')}</summary><p className="goal-help">{t('Surplus uses this month’s income estimates, expenses, budgets and mortgage payments. One-time entries are excluded.')}</p></details></div>
   </aside>

   <div className="goal-results">
    {result ? <>
     <div className="goal-outcome" aria-live="polite" aria-atomic="true">
      <div className="goal-outcome-top"><span>{t('Projected at target date')}</span><span className={`goal-outcome-badge ${reached ? 'is-reached' : ''}`}>{reached ? <Check size={14} aria-hidden="true" /> : <TrendingUp size={14} aria-hidden="true" />}{t(reached ? 'Target reached' : 'Below target')}</span></div>
      <strong className="goal-projected-value">{money(result.projected)}</strong>
      <p>{t('Target amount')}: <strong>{money(goal.target)}</strong><span> · {goal.target_date && formatDate(goal.target_date, locale)}</span></p>
      <progress className="goal-target-progress" value={progress} max={100} aria-label={t('Projected progress toward target')} />
      <div className="goal-outcome-bottom"><span>{t('{percent}% of target', { percent: formatNumber(Math.max(0, result.projected / goal.target * 100), locale, 0) })}</span><span>{t(reached ? '{amount} above target' : '{amount} left to reach target', { amount: money(Math.abs(goal.target - result.projected)) })}</span></div>
     </div>

     <div className="goal-summary-stats">
      <div><span>{t(goal.kind === 'net_worth' ? 'Current net worth' : 'Allocated amount')}</span><strong>{starting === null ? '—' : money(starting)}</strong></div>
      <div><span>{t('Monthly contribution needed')}</span><strong>{result.required === null ? '—' : money(result.required)}</strong></div>
      <div><span>{t('Assumed annual return')}</span><strong>{percent(rate)}</strong></div>
     </div>

     <div className={`goal-insight ${overBudget > 0 || !reached ? 'goal-insight-attention' : ''}`} role="status">
      {overBudget > 0 || !reached ? <CircleHelp size={19} aria-hidden="true" /> : <Check size={19} aria-hidden="true" />}
      <div>{result.required === null ? <p>{t(result.overdue ? 'The deadline has passed. Choose a future date to make a new plan.' : 'The deadline is before the first monthly contribution. Extend it or add funds now.')}</p> : <>
       <strong>{t(reached ? 'This scenario reaches your goal.' : 'This scenario falls short by {amount}.', { amount: money(Math.max(0, goal.target - result.projected)) })}</strong>
       {overBudget > 0 ? <p>{t('This monthly investment exceeds your available surplus by {amount}.', { amount: money(overBudget) })}</p> : surplus !== null && result.required > Math.max(0, surplus) ? <p>{t('You need {amount} more per month than your available surplus.', { amount: money(result.required - Math.max(0, surplus)) })}</p> : surplus !== null ? <p>{t('Your monthly investment fits within your available surplus.')}</p> : null}
      </>}</div>
     </div>
    </> : <div className="goal-projection-empty"><TrendingUp size={36} aria-hidden="true" /><h3>{t('Build your projection')}</h3>
     {starting === null && <p role="status">{t('Exchange rates are missing. The goal projection needs your complete net worth.')}</p>}
     {surplus === null && <p>{t('Surplus is unavailable. Enter a monthly investment to explore a scenario.')}</p>}
     {!goal.target_date && <Button variant="outline" onClick={onEdit}>{t('Choose a target date to see your plan.')}<ArrowUpRight size={16} aria-hidden="true" /></Button>}
    </div>}
   </div>
  </div>

  {result && <section className="goal-chart-section" aria-labelledby={`${id}-chart-title`}>
   <div className="goal-chart-heading"><h3 id={`${id}-chart-title`}>{t('Your path to the goal')}</h3><div className="goal-view-switch" role="group" aria-label={t('Projection view')}><button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')}>{t('Chart')}</button><button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>{t('Monthly milestones')}</button></div></div>
   {view === 'chart' ? <>
    <div className="comparison-legend goal-chart-legend">{lines.map(line => <button key={line.key} type="button" aria-pressed={!hidden.includes(line.key)} onClick={() => setHidden(previous => previous.includes(line.key) ? previous.filter(key => key !== line.key) : [...previous, line.key])}><svg width="24" height="12" viewBox="0 0 24 12" aria-hidden="true">{line.key === 'actual' ? <circle cx="12" cy="6" r="4" fill={line.color} /> : <line x1="0" y1="6" x2="24" y2="6" stroke={line.color} strokeWidth="2" strokeDasharray={line.dash} />}</svg>{t(line.label)}</button>)}</div>
    {goal.kind === 'net_worth' && <p className="goal-help">{t('Actual net worth today: {amount}. Actual values stop at today; future values are forecasts.', { amount: starting === null ? '—' : money(starting) })}</p>}
    <div className="goal-projection-chart" role="region" aria-label={t('Your path to the goal')} tabIndex={0}><div className="goal-chart-canvas"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={points} accessibilityLayer margin={{ top: 24, right: 24, left: 8, bottom: 12 }}>
     <defs><linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.18} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0.01} /></linearGradient></defs>
     <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
     <XAxis dataKey="time" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={time => formatMonthYear(isoDate(Number(time)), locale)} minTickGap={80} height={64} tickLine={false} axisLine={false} tickMargin={16} tick={{ fill: 'var(--foreground)', fontSize: 16 }} />
     <YAxis width="auto" tickMargin={12} tickFormatter={money} domain={['auto', 'auto']} tickCount={5} tickLine={false} axisLine={false} tick={{ fill: 'var(--foreground)', fontSize: 16 }} />
     <Tooltip labelFormatter={time => formatDate(isoDate(Number(time)), locale)} formatter={(amount, name) => [money(Number(amount)), t(lines.find(line => line.key === name)?.label ?? String(name))]} contentStyle={{ background: 'var(--popover)', color: 'var(--popover-foreground)', borderColor: 'var(--border)', borderRadius: 14, boxShadow: '0 8px 32px #00000014', fontSize: 16, lineHeight: 1.7, padding: 16 }} />
     <ReferenceLine x={Date.parse(today + 'T00:00:00Z')} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: t('Today'), position: 'bottom', offset: 22, fill: 'var(--foreground)', fontSize: 16 }} />
     {!hidden.includes('projected') && <Area dataKey="projected" stroke="var(--primary)" strokeWidth={3} fill={`url(#${id}-fill)`} isAnimationActive={false} />}
     {lines.filter(line => line.key !== 'projected' && line.key !== 'actual' && !hidden.includes(line.key)).map(line => <Line key={line.key} dataKey={line.key} stroke={line.color} strokeDasharray={line.dash} strokeWidth={line.key === 'target' ? 1.5 : 2} dot={false} connectNulls={false} isAnimationActive={false} />)}
     {!hidden.includes('actual') && <Line dataKey="actual" stroke="var(--foreground)" strokeWidth={2} dot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2, fill: 'var(--foreground)' }} connectNulls={false} isAnimationActive={false} />}
    </ComposedChart></ResponsiveContainer></div></div>
    {goal.kind === 'net_worth' && historyError && <p className="goal-help">{t(historyError)}</p>}
    {goal.kind === 'net_worth' && !history.length && <p className="goal-help">{t('Your net-worth history starts with today’s value. Saved snapshots will extend the actual line.')}</p>}
    <p className="goal-help">{t('Both future paths start from today’s value. They overlap when your planned monthly investment matches the contribution needed to reach the goal.')}</p>
   </> : <div className="table-scroll goal-milestones" role="region" aria-label={t('Monthly milestones')} tabIndex={0}><table><thead><tr><th scope="col">{t('Date')}</th><th scope="col">{t('Your projected path')}</th><th scope="col">{t('Path to your goal')}</th></tr></thead><tbody>{result.points.map(point => <tr key={point.date}><td>{formatDate(point.date, locale)}</td><td>{money(point.projected)}</td><td>{point.required === null ? '—' : money(point.required)}</td></tr>)}</tbody></table></div>}
  </section>}

  <details className="goal-method"><summary><CircleHelp size={17} aria-hidden="true" />{t('How this projection works')}<ChevronDown size={16} aria-hidden="true" /></summary><div><p>{t('Existing wealth stays constant. New investments are added on each monthly anniversary and compound at your assumed annual return. Taxes, fees, inflation and future exchange-rate changes are excluded. Returns are assumptions, not guarantees.')}</p><p>{t('Each goal is a separate scenario. Do not allocate the same surplus to multiple savings goals. Savings allocations already belong to your net worth.')}</p></div></details>
  <footer className="goal-save-bar"><span className="goal-save-status" role="status">{goal.archived ? t('Archived') : dirty ? <><i />{t('Unsaved changes')}</> : <><Check size={16} aria-hidden="true" />{t('Plan saved')}</>}</span><div><Button variant="ghost" disabled={busy || !dirty || goal.archived} onClick={() => { setMonthly(savedPlan.monthly); setRate(savedPlan.rate); setError(''); }}><RotateCcw size={15} aria-hidden="true" />{t('Reset changes')}</Button><Button disabled={busy || goal.archived || !dirty} onClick={savePlan}><Save size={16} aria-hidden="true" />{t(busy ? 'Saving…' : 'Save plan')}</Button></div></footer>
  {error && <p className="error" role="alert">{t(error)}</p>}
 </section>;
}

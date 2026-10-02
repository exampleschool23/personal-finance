"use client";
import { useLanguage } from '@/components/language-provider';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { formatDate, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { goalEmoji } from '@/lib/goal-emoji';
import { goalStatus, goalStatusLabels, goalSummary } from '@/lib/goal-projection';
import type { Goal } from '@/lib/planning';

/** The head of a goal's page, as in Monarch: its mark, name and status, saved of target with progress, then left to save, monthly saving and target date. */
export function GoalDetail({ goal, current, currency, today }: { goal: Goal; current: number | null; currency: string; today: string }) {
 const { t, locale } = useLanguage();
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const summary = goalSummary(goal, current, today), status = goalStatus(summary);
 return <section className="panel goal-detail" aria-label={goal.name}>
  <div className="goal-detail-head">
   <header><span className="goal-detail-mark" aria-hidden="true">{goalEmoji(goal)}</span><div><h2>{goal.name}</h2>{status && <span className={'status-badge goal-status is-' + status}>{t(goalStatusLabels[status])}</span>}</div></header>
   <p><strong>{current === null ? '—' : money(current)}</strong><span>{t('of {amount}', { amount: money(Number(goal.target)) })}</span>{summary.percent !== null && <span className="goal-detail-percent">{formatPercent(summary.percent, locale, 0)}</span>}</p>
   <div className="progress-track"><div style={{ width: `${summary.percent ?? 0}%` }}/></div>
  </div>
  {/* The amount saved already heads the card, so the figures start with what is left. */}
  <StatTiles columns={3} label={t('Goal summary')}>
   <StatTile label={t('Left to save')} value={summary.left === null ? '—' : money(summary.left)}/>
   <StatTile label={t('Monthly contribution')} value={summary.monthly ? money(summary.monthly) : '—'}>{summary.needed !== null && summary.needed > 0 && <p>{t('{amount} a month reaches the target on time', { amount: money(summary.needed) })}</p>}</StatTile>
   <StatTile label={t('Target date')} value={goal.target_date ? formatDate(goal.target_date, locale) : t('No target date')}>{summary.monthsLeft !== null && <p>{summary.monthsLeft > 0 ? t('{count} months left', { count: formatNumber(summary.monthsLeft, locale, 0) }) : t('Target date reached')}</p>}</StatTile>
  </StatTiles>
 </section>;
}

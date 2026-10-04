"use client";
import type { ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { goalStatusLabels, type GoalStatus } from '@/lib/goal-projection';

type Props = { emoji: string; name: string; status: GoalStatus | null; meta: ReactNode; amount: ReactNode; detail: ReactNode; percent: number | null };

/** The content of a goal row: cover, name and amount, status pill with date and "% of target", and progress.
 * The goals list wraps it in a button; the add-goal flow shows it as a preview. */
export function GoalSummaryRow({ emoji, name, status, meta, amount, detail, percent }: Props) {
 const { t } = useLanguage();
 return <>
  <span className="goal-row-cover" aria-hidden="true">{emoji}</span>
  <span className="goal-row-body">
   <span className="goal-row-line"><strong>{name}</strong><strong className="goal-row-amount">{amount}</strong></span>
   <span className="goal-row-line goal-row-meta"><span>{status && <span className={'status-badge goal-status is-' + status}>{t(goalStatusLabels[status])}</span>}<span>{meta}</span></span><span>{detail}</span></span>
   <span className="progress-track" data-status={status ?? undefined}><span style={{ width: `${percent ?? 0}%` }}/></span>
  </span>
 </>;
}

"use client";
import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { Count } from '@/components/presentation-foundation/count';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { ResourceState } from '@/components/presentation-foundation/resource-state';
import { RowMenu } from '@/components/presentation-foundation/row-menu';
import { Button } from '@/components/ui/button';
import { useColumnsFit } from '@/hooks/use-columns-fit';
import { depositToday } from '@/lib/deposit-interest';
import type { Entry } from '@/lib/finance';
import { formatDate, formatMoney } from '@/lib/format';
import { applySubscriptionDecisions, cadenceLabels, detectSubscriptions, recurringPlanDraft, subscriptionTotals, type Subscription, type SubscriptionDecision } from '@/lib/recurring-insights';

type Key = Pick<SubscriptionDecision, 'merchant' | 'currency'>;
type Props = {
 records: Entry[]; decisions: SubscriptionDecision[]; loading: boolean; error?: string; onRetry: () => void;
 decide: (decision: SubscriptionDecision) => Promise<void>; restore: (key: Key) => Promise<void>;
 /** Opens the record form with a recurring plan to review; nothing is saved until the person saves it. */
 onTrack: (draft: Entry) => void;
};

/** Subscriptions found in recorded spending, with their monthly and yearly cost per currency. */
export function SubscriptionsPanel({ records, decisions, loading, error, onRetry, decide, restore, onTrack }: Props) {
 const { t, locale } = useLanguage(), today = depositToday();
 const [failure, setFailure] = useState(''), [busy, setBusy] = useState(false);
 const { active, hidden } = applySubscriptionDecisions(detectSubscriptions(records, today), decisions);
 const totals = subscriptionTotals(active);
 // Rows stay on one line while their name keeps room beside status, amount and menu.
 const rows = useColumnsFit<HTMLUListElement>('.recurring-row');
 async function run(action: () => Promise<void>) { setBusy(true); setFailure(''); try { await action(); } catch (e) { setFailure((e as Error).message); } finally { setBusy(false); } }
 const key = (item: Subscription): Key => ({ merchant: item.merchant, currency: item.currency });
 const status = (item: Subscription) => item.missed ? <span className="status-badge is-caution">{t('Possibly cancelled')}</span>
  : item.priceIncrease ? <span className="status-badge is-caution">{t('Price went up')}</span>
  : <span className="status-badge">{t('Next charge {date}', { date: formatDate(item.next, locale) })}</span>;
 return <section className="panel subscriptions-panel" aria-labelledby="subscriptions-title">
  <ErrorPopup message={failure}/>
  <PanelTitle title={<span id="subscriptions-title">{t('Subscriptions')}</span>} count={<Count value={active.length} loading={loading}/>} hint={t('Charges that repeat from the same merchant at a steady price. Totals leave out subscriptions that look cancelled, and different currencies are listed separately.')}>
   {totals.length > 0 && <div className="subscription-totals">{totals.map(total => <span key={total.currency}>{t('{monthly} a month · {yearly} a year', { monthly: formatMoney(total.monthly, total.currency, locale), yearly: formatMoney(total.yearly, total.currency, locale) })}</span>)}</div>}
  </PanelTitle>
  <ResourceState loading={loading} error={error} onRetry={onRetry}>
   {active.length ? <ul className="subscription-list" ref={rows}>{active.map(item => <li key={item.id} className="recurring-row" data-status={item.missed ? 'missed' : undefined}>
    <span className="transaction-merchant"><CategoryIcon kind={item.record.kind}/><span><strong>{item.record.name}</strong><small>{t(cadenceLabels[item.cadence])} · {item.priceIncrease ? t('Up from {amount}', { amount: formatMoney(item.priceIncrease.from, item.currency, locale) }) : t('Last charged {date}', { date: formatDate(item.lastCharge, locale) })}</small></span></span>
    {status(item)}
    <span className="transaction-amount"><strong>{formatMoney(item.amount, item.currency, locale)}</strong><small className="block muted">{t('{amount} a year', { amount: formatMoney(item.yearly, item.currency, locale) })}</small></span>
    <div className="row-actions"><RowMenu label={t('Actions for {name}', { name: item.record.name })} items={[
     { label: t('Track as recurring'), disabled: busy, onSelect: () => onTrack(recurringPlanDraft(item.record, item.cadence, item.next, crypto.randomUUID())) },
     { label: t('Mark cancelled'), disabled: busy, onSelect: () => run(() => decide({ ...key(item), status: 'cancelled', decided_on: today })) },
     { label: t('Not a subscription'), disabled: busy, onSelect: () => run(() => decide({ ...key(item), status: 'dismissed', decided_on: today })) },
    ]}/></div>
   </li>)}</ul> : <EmptyState icon={<CreditCard aria-hidden="true"/>} description={t('No subscriptions found yet. They appear once the same charge repeats a few times.')}/>}
   {hidden.length > 0 && <details className="subscription-hidden"><summary>{t('Hidden subscriptions')}<Count value={hidden.length}/></summary><ul className="tool-list">{hidden.map(({ item, decision }) => <li key={item.id}>
    <span>{item.record.name} · {t(decision.status === 'cancelled' ? 'Cancelled' : 'Not a subscription')}</span>
    <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => restore(key(item)))}>{t('Restore')}</Button>
   </li>)}</ul></details>}
  </ResourceState>
 </section>;
}

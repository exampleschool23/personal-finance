"use client";
import type { ReactNode } from 'react';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { signTone } from '@/components/presentation-foundation/tone';
import { CalendarClock, Landmark } from 'lucide-react';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { PartialTotal } from '@/components/presentation-foundation/partial-total';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { categoryColor } from '@/lib/category-colors';
import { estimatedCashFlow, financialTotals, income, type Entry } from '@/lib/finance';
import { formatDate, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { assetAllocation, nextPayments } from '@/lib/overview';
import { upcomingPayments, type PlanningData } from '@/lib/planning';

/** `firstVisit` greets a brand-new account with "Welcome" instead of "Welcome back". */
export function OverviewHeading({ name, firstVisit = false, children }: { name?: string; firstVisit?: boolean; children?: ReactNode }) {
 const { t } = useLanguage();
 const title = firstVisit ? (name ? t('Welcome, {name}!', { name }) : t('Welcome!')) : name ? t('Welcome back, {name}!', { name }) : t('Welcome back!');
 return <PageHeader title={title}>{children}</PageHeader>;
}

type Props = { entries: Entry[]; currency: string; excludedCurrencies: string[]; forecast: ReturnType<typeof estimatedCashFlow>; forecastReady: boolean; planning: PlanningData | null };
/** Dashboard cards: each card carries its headline figure in its title, so it reads at a glance. */
export function useOverviewCards({ entries, currency, excludedCurrencies, forecast, forecastReady, planning }: Props) {
 const { t, locale } = useLanguage();
 const { entered } = useDisplayMoney();
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const percent = (value: number | null) => formatPercent(value ?? NaN, locale, 1, 1);
 const { totalAssets, totalDebt } = financialTotals(entries);
 const allocation = assetAllocation(entries);
 const upcomingItems = planning ? upcomingPayments(planning.records, planning.occurrences, undefined, undefined, planning.debtPayments) : [];
 const due = nextPayments(upcomingItems);
 // The pill counts every item, not just the rows shown, and never calls an overdue item "due soon".
 const overdueCount = upcomingItems.filter(item => item.overdue).length;
 const figure = (value: string) => <span className="panel-figure">{value}</span>;
 const commitments = <section className="panel overview-panel" key="commitments">
  <PanelTitle title={<>{t("Monthly commitments")} {forecastReady && figure(t('{amount} left', { amount: money(forecast.forecast) }))}</>} hint={<>
   <p>{t('Estimated asset income: {amount}', { amount: money(forecast.estimatedIncome) })}</p>
   <p>{t('Other recurring income: {amount}', { amount: money(forecast.otherIncome) })}</p>
   <p>{t("Yearly records are divided by 12. A category's budget counts when it is more than the bills in that category. One-time records are excluded.")}</p>
  </>}/>
  <ul className="overview-list overview-commitments">
   <li><CategoryIcon kind="Salary"/><span>{t("Income")}</span><strong className="positive">{money(forecast.plannedIncome)}</strong></li>
   <li><CategoryIcon kind="Living expense"/><span>{t("Expenses")}</span><strong>{forecastReady ? money(forecast.monthlyExpenses) : '—'}</strong></li>
   <li><CategoryIcon kind="Mortgage"/><span>{t("Estimated mortgage payments")}</span><strong>{money(forecast.mortgagePayments)}</strong></li>
   {forecast.loanPayments > 0 && <li><CategoryIcon kind="Loan"/><span>{t("Estimated loan payments")}</span><strong>{money(forecast.loanPayments)}</strong></li>}
  </ul>
  <div className="cash-footer"><span>{t("Left after expenses")}</span><strong className={forecastReady ? signTone(forecast.forecast, true) : undefined}>{forecastReady ? money(forecast.forecast) : '—'}</strong></div>
 </section>;
 const allocationCard = <section className="panel overview-panel" key="allocation">
  <PanelTitle title={<>{t("Asset allocation")} {figure(money(totalAssets))}</>} hint={totalDebt > 0 ? <p>{t('Outstanding debt')}: {money(totalDebt)}</p> : undefined}><DrawerLink href="/assets">{t('View all')}</DrawerLink></PanelTitle>
  <PartialTotal currencies={excludedCurrencies}/>
  {allocation.length ? <>
   <div className="allocation-bar" role="img" aria-label={t("Asset allocation")}>{allocation.map(item => <div key={item.kind} style={{ width: `${item.share}%`, background: categoryColor(item.kind) }}/>)}</div>
   <ul className="overview-list">{allocation.map(item => <li key={item.kind}><i style={{ background: categoryColor(item.kind) }}/><span>{t(item.kind)}</span><strong>{money(item.total)}</strong><small>{percent(item.share)}</small></li>)}</ul>
  </> : <EmptyState icon={<Landmark/>} description={t("Add your first asset to see its allocation.")}/>}
 </section>;
 const upcoming = <section className="panel overview-panel" key="upcoming">
  <PanelTitle title={<>{t('Upcoming payments')} {overdueCount > 0 ? <span className="panel-figure negative">{t('{count} overdue', { count: formatNumber(overdueCount, locale, 0) })}</span> : upcomingItems.length > 0 && figure(t('{count} due soon', { count: formatNumber(upcomingItems.length, locale, 0) }))}</>}><DrawerLink href="/upcoming">{t('View all')}</DrawerLink></PanelTitle>
  {due.length ? <ul className="overview-list overview-due">{due.map(item => {
   const incoming = income.includes(item.record.kind);
   return <li key={item.key}><CategoryIcon kind={item.record.kind}/><span>{item.record.name}<small className={item.overdue ? 'negative' : undefined}>{item.overdue ? t('Overdue') + ' · ' : ''}{formatDate(item.date, locale)}</small></span><strong className={incoming ? 'positive' : undefined}>{incoming ? '+' : ''}{entered(item.amount, item.record.currency)}</strong></li>;
  })}</ul> : planning ? <EmptyState icon={<CalendarClock/>} description={t('Nothing is due in the next 31 days.')}/> : <LoadingPlaceholder label={t('Loading records…')} rows={3}/>}
 </section>;
 return { commitments, allocation: allocationCard, upcoming };
}

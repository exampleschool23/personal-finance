"use client";
import { ArrowDownLeft, ArrowUpRight, Building2, CalendarClock, ChartNoAxesCombined, HandCoins, Landmark, Wallet } from 'lucide-react';
import { DrawerLink } from '@/components/drawer-link';
import { PageHeader } from '@/components/page-header';
import { StatTile, StatTiles } from '@/components/stat-tile';
import { PartialTotal } from '@/components/partial-total';
import { useLanguage } from '@/components/language-provider';
import { categoryColor } from '@/lib/category-colors';
import { depositToday } from '@/lib/deposit-interest';
import { estimatedCashFlow, financialTotals, income, type Entry } from '@/lib/finance';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { assetAllocation, nextPayments, overviewIndicators } from '@/lib/overview';
import { upcomingPayments, type PlanningData } from '@/lib/planning';

export function OverviewHeading({ name }: { name?: string }) {
 const { t, locale } = useLanguage();
 return <PageHeader eyebrow={formatDate(depositToday(), locale)} title={name ? t("Hi, {name}!", { name }) : t("Hi there!")} description={t("Everything you own, earn, and owe. In one place.")}/>;
}

type Props = { entries: Entry[]; currency: string; excludedCurrencies: string[]; forecast: ReturnType<typeof estimatedCashFlow>; forecastReady: boolean; planning: PlanningData | null };
export function OverviewSummary({ entries, currency, excludedCurrencies, forecast, forecastReady, planning }: Props) {
 const { t, locale } = useLanguage();
 const money = (amount: number, unit = currency) => formatMoney(amount, unit, locale);
 const percent = (value: number | null) => value === null ? '—' : formatNumber(value, locale, 1) + '%';
 const { totalAssets, totalDebt } = financialTotals(entries);
 const indicators = overviewIndicators(entries);
 const allocation = assetAllocation(entries);
 const committed = forecast.monthlyExpenses + forecast.mortgagePayments;
 const due = planning ? nextPayments(upcomingPayments(planning.records, planning.occurrences)) : [];
 return <>
  <StatTiles>
   <StatTile label={t("Total assets")} icon={<Landmark aria-hidden="true"/>} value={money(totalAssets)}><p>{t('Cash available')}: {money(indicators.cash)} · {percent(indicators.cashShare)}</p><PartialTotal currencies={excludedCurrencies}/></StatTile>
   <StatTile label={t("Outstanding debt")} icon={<HandCoins aria-hidden="true"/>} value={money(totalDebt)}><p>{t('Debt to assets')}: {percent(indicators.debtToAssets)}</p><PartialTotal currencies={excludedCurrencies}/></StatTile>
   <StatTile label={t("Estimated monthly cash flow")} icon={<Wallet aria-hidden="true"/>} value={forecastReady ? money(forecast.forecast) : '—'} tone={forecastReady ? forecast.forecast >= 0 ? 'positive' : 'negative' : undefined}><p>{t("Income")}: {money(forecast.plannedIncome)} · {t("Expenses")}: {forecastReady ? money(committed) : '—'}</p></StatTile>
   <StatTile label={t('Stock & crypto gain / loss')} icon={<ChartNoAxesCombined aria-hidden="true"/>} value={indicators.investmentGain === null ? '—' : money(indicators.investmentGain)} tone={indicators.investmentGain === null ? undefined : indicators.investmentGain >= 0 ? 'positive' : 'negative'}><p>{indicators.investmentReturn === null ? t('Only holdings with a purchase price are included.') : t('Return on purchase cost: {percent}', { percent: percent(indicators.investmentReturn) })}</p></StatTile>
  </StatTiles>
  <div className="overview-grid">
   <section className="panel overview-panel">
    <div className="panel-title"><h2>{t("Asset allocation")}</h2><span>{t("Current balances")}</span></div>
    {allocation.length ? <>
     <div className="allocation-bar" role="img" aria-label={t("Asset allocation")}>{allocation.map(item => <div key={item.kind} style={{ width: `${item.share}%`, background: categoryColor(item.kind) }}/>)}</div>
     <ul className="overview-list">{allocation.map(item => <li key={item.kind}><i style={{ background: categoryColor(item.kind) }}/><span>{t(item.kind)}</span><strong>{money(item.total)}</strong><small>{percent(item.share)}</small></li>)}</ul>
    </> : <div className="empty"><Landmark/><p>{t("Add your first asset to see its allocation.")}</p></div>}
   </section>
   <section className="panel overview-panel">
    <div className="panel-title"><h2>{t("Monthly commitments")}</h2><span>{t("Recurring and planned")}</span></div>
    <div className="cash-row"><span className="icon-box"><ArrowDownLeft/></span><div><p>{t("Income")}</p><small>{t('Estimated asset income: {amount}', { amount: money(forecast.estimatedIncome) })} · {t('Other recurring income: {amount}', { amount: money(forecast.otherIncome) })}</small></div><strong className="positive">{money(forecast.plannedIncome)}</strong></div>
    <div className="cash-row"><span className="icon-box outgoing"><ArrowUpRight/></span><div><p>{t("Expenses")}</p><small>{t("Rent, living costs & more")}</small></div><strong>{forecastReady ? money(forecast.monthlyExpenses) : '—'}</strong></div>
    <div className="cash-row"><span className="icon-box outgoing"><Building2/></span><div><p>{t("Estimated mortgage payments")}</p><small>{t("Principal and interest")}</small></div><strong>{money(forecast.mortgagePayments)}</strong></div>
    <div className="cash-footer"><span>{t("Left after expenses")}</span><strong className={forecastReady && forecast.forecast < 0 ? 'negative' : undefined}>{forecastReady ? money(forecast.forecast) : '—'}</strong></div>
    <p className="footnote">{t("Yearly records are divided by 12. Linked plan spending is counted within its plan; other one-time records are excluded.")}</p>
   </section>
   <section className="panel overview-panel">
    <div className="panel-title"><h2>{t('Upcoming payments')}</h2><DrawerLink href="/upcoming">{t('View all')}</DrawerLink></div>
    {due.length ? <ul className="overview-list overview-due">{due.map(item => {
     const incoming = income.includes(item.record.kind);
     return <li key={item.key}><span className={incoming ? 'icon-box' : 'icon-box outgoing'}>{incoming ? <ArrowDownLeft/> : <ArrowUpRight/>}</span><span>{item.record.name}<small className={item.overdue ? 'negative' : undefined}>{item.overdue ? t('Overdue') + ' · ' : ''}{formatDate(item.date, locale)}</small></span><strong className={incoming ? 'positive' : undefined}>{incoming ? '+' : ''}{money(item.record.amount, item.record.currency)}</strong></li>;
    })}</ul> : <div className="empty"><CalendarClock/><p>{t(planning ? 'Nothing is due in the next 31 days.' : 'Loading records…')}</p></div>}
   </section>
  </div>
 </>;
}

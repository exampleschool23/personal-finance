"use client";
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ResourceState } from '@/components/presentation-foundation/resource-state';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { useLanguage } from '@/components/language-provider';
import { Pagination } from '@/components/presentation-foundation/pagination';
import { accountActivityPage } from '@/lib/account-activity-page';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { income, type Entry } from '@/lib/finance';
import { decimalSum } from '@/lib/decimal-amounts';
import { isHolding, unitCount } from '@/lib/asset-movements';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { emptyPlanning, type PlanningData } from '@/lib/planning';

const operationLabels: Record<string,string> = {transfer:'Transfer money',reconcile:'Reconcile balance',repayment:'Record repayment',mortgage:'Record mortgage payment'};
const movementLabels = {transfer:'Transfer money',buy:'Buy holding',sell:'Sell / convert holding',interest:'Record capitalized interest'} as const;
type Activity = ReturnType<typeof accountActivityPage>;

/** Balance operations: transfers, reconciliations, repayments and mortgage payments, with the balance after each. */
function OperationsTable({ activity, data, fallback }: { activity: Activity; data: PlanningData; fallback: string }) {
 const { t, locale } = useLanguage();
 const cash = data.records.filter(record=>record.kind==='Cash');
 if(!activity.activity.length)return null;
 return <div className="table-scroll"><table><thead><tr><th>{t('Date')}</th><th>{t('Account')}</th><th>{t('Activity')}</th><th>{t('Amount')}</th><th>{t('Balance after')}</th></tr></thead><tbody>{activity.activity.map(item=>{const account=cash.find(a=>a.id===item.account_id);return <tr key={item.id}><td>{formatDate(item.occurred_on,locale)}</td><td>{account?.name??'—'}</td><td>{t(operationLabels[item.action]??item.action)}{item.target_id&&<small className="block">{data.records.find(record=>record.id===item.target_id)?.name}</small>}{item.notes&&<small className="block">{item.notes}</small>}</td><td>{formatMoney(item.action==='mortgage'?decimalSum([item.amount,item.fee]):item.amount,account?.currency??fallback,locale)}</td><td>{formatMoney(item.after_balance,account?.currency??fallback,locale)}</td></tr>;})}</tbody></table></div>;
}

/** Money and holdings moved between accounts: what left one and what reached the other. */
function MovementsTable({ activity, data, fallback }: { activity: Activity; data: PlanningData; fallback: string }) {
 const { t, locale } = useLanguage();
 if(!activity.movements.length)return null;
 const amount=(record:Entry|undefined,n:number)=>record&&isHolding(record)?unitCount(t,n,locale):formatMoney(n,record?.currency??fallback,locale);
 return <div className="table-scroll"><table><thead><tr><th>{t('Date')}</th><th>{t('Activity')}</th><th>{t('From')}</th><th>{t('To')}</th></tr></thead><tbody>{activity.movements.map(item=>{const source=data.records.find(record=>record.id===item.source_id),target=data.records.find(record=>record.id===item.target_id);return <tr key={item.id}><td>{formatDate(item.occurred_on,locale)}</td><td>{t(movementLabels[item.kind])}{item.notes&&<small className="block">{item.notes}</small>}</td><td>{item.kind==='interest'?'—':<>{source?.name}<small className="block">{amount(source,item.sent)}</small></>}</td><td>{target?.name}<small className="block">{amount(target,item.received)}</small></td></tr>;})}</tbody></table></div>;
}

/** Income and expenses booked to the cash accounts, spending as money out; and cash moved for investments. */
function CashFlowTable({ activity, data, fallback }: { activity: Activity; data: PlanningData; fallback: string }) {
 const { t, locale } = useLanguage();
 const cash = data.records.filter(record=>record.kind==='Cash');
 if(!activity.records.length&&!activity.investmentLinks.length)return null;
 return <><h3>{t('Income & expenses')}</h3><div className="table-scroll"><table><tbody>{activity.records.map(record=><tr key={record.id}><td>{formatDate(record.date,locale)}</td><td>{record.name}</td><td>{cash.find(account=>account.id===record.account_id)?.name}</td><td>{formatMoney(income.includes(record.kind)?record.amount:-record.amount,record.currency,locale)}</td></tr>)}{activity.investmentLinks.map(link=>{const account=cash.find(a=>a.id===link.account_id);return <tr key={link.id}><td>{formatDate(link.investment_history.occurred_on,locale)}</td><td>{data.records.find(record=>record.id===link.investment_history.record_id)?.name}</td><td>{account?.name}</td><td>{formatMoney(link.amount,account?.currency??fallback,locale)}</td></tr>;})}</tbody></table></div></>;
}

/** Every record booked to an account, the loaded ones first: the Accounts read leaves income and spending out. */
export function withBookedRecords(records: Entry[], booked: Entry[]): Entry[] {
 const loaded = new Set(records.map(record => record.id));
 return [...records, ...booked.filter(record => !loaded.has(record.id))];
}

/** The Recent activity view of Accounts, a page at a time; switching workspace starts again at page one. A signed-in
 * workspace reads the income and spending booked to its accounts when the view opens; the sample has them already. */
export function AccountActivity({ data, owner, live = !!owner, revision = 0, currency }: { data: PlanningData; owner: string|null; live?: boolean; revision?: number; /** For rows whose account is gone. */ currency: string }) {
 const { t, locale } = useLanguage();
 const [activityPage,setActivityPage]=useState({owner,page:1});
 const booked=useOwnerResource('/api/planning?scope=account-activity',owner,live,revision,emptyPlanning);
 const history=useMemo(()=>live?{...data,records:withBookedRecords(data.records,booked.data.records)}:data,[live,data,booked.data.records]);
 const activity=accountActivityPage(history,activityPage.owner===owner?activityPage.page:1);
 return <section className="panel account-activity"><PanelTitle title={t('Recent activity')} hint={t('Account totals use current quotes where available and saved prices otherwise. Holdings are counted once in your assets.')}><Link className="panel-link" href="/assets">{t('View all assets')}</Link></PanelTitle>
  <ResourceState loading={live&&booked.initialLoading} error={live?booked.error:null} onRetry={booked.retry}>
  <OperationsTable activity={activity} data={data} fallback={currency}/>{!activity.total&&<p className="muted">{t('No account operations yet.')}</p>}
  <MovementsTable activity={activity} data={data} fallback={currency}/>
  <CashFlowTable activity={activity} data={data} fallback={currency}/>
  <Pagination label={t('Account activity')} summary={t('Page {page} of {pages} · {count} records',{page:formatNumber(activity.page,locale,0),pages:formatNumber(activity.pages,locale,0),count:formatNumber(activity.total,locale,0)})} page={activity.page} pageCount={activity.pages} hasNext={activity.page<activity.pages} onPage={page=>setActivityPage({owner,page})}/>
  </ResourceState>
 </section>;
}

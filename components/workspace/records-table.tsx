"use client";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { CategoryBadge } from '@/components/category-badge';
import { useLanguage } from '@/components/language-provider';
import { LoadingPlaceholder } from '@/components/loading-placeholder';
import { RecordFilters, emptyRecordFilters } from '@/components/record-filters';
import { RecordIcon } from '@/components/record-icon';
import { Button } from '@/components/ui/button';
import { type Entry, expenses, income, kinds, lendingRecordKinds, liabilities, value } from '@/lib/finance';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { trackedKinds } from '@/lib/investment-history';
import { isTransactionHistory } from '@/lib/transaction-history';
import { useWorkspace } from '@/components/workspace/workspace-provider';

type Props = {
 title: string; caption: string;
 /** Transactions are signed, open their details on click and can be split. */
 transactions?: boolean;
 /** Show only the first rows, as a preview. */
 limit?: number;
 pagination?: boolean;
 children?: ReactNode;
};

/** The filterable record list shared by Cash flow and Loans & debts. */
export function RecordsTable({ title, caption, transactions = false, limit, pagination = true, children }: Props) {
 const { t, locale } = useLanguage();
 const { filters, setFilters, filtersActive, historyOnly, useFilteredRecords, remoteHistory, historyPage, visible, totalRecords, pageCount, tablePage, tableLoading, recordsLoading, showPage,
  sectionKey, planning, transactionTools, availableBusinesses, rows, demo, busy, currency, money, quoteLabel,
  addRecord, editRecord, requestDelete, setViewing, setStopping, setTracking, setPayingMortgage, setSplitting } = useWorkspace();
 const date = (day: string) => formatDate(day, locale);
 const saved = (record: Entry) => rows.find(row => row.id === record.id) || record;
 const shown = limit === undefined ? visible : visible.slice(0, limit);
 return <section id="workspace-records" className={`panel records${historyOnly ? ' transaction-history' : ''}`}>
  <div className="panel-title"><h2>{title} <span className="count">{tableLoading ? '—' : formatNumber(totalRecords, locale, 0)}</span></h2><span>{caption}</span></div>
  <RecordFilters value={filters} onChange={setFilters} categories={planning.data.categories} kinds={sectionKey === 'debts' ? lendingRecordKinds : sectionKey === 'cashflow' ? [...income,...expenses] : kinds}/>
  {remoteHistory&&historyPage.error&&<p role="alert" className="error">{t(historyPage.error)} <Button onClick={historyPage.retry}>{t('Retry')}</Button></p>}
  {useFilteredRecords&&planning.error&&<p role="alert" className="error">{t(planning.error)}</p>}
  {tableLoading ? <LoadingPlaceholder label={t("Loading records…")}/> : visible.length ? <div className="table-scroll"><table>
   <thead><tr><th>{t("Name")}</th><th>{t("Category")}</th><th>{transactions ? t("Date") : t("Date / due date")}</th><th>{transactions ? t("Amount") : t("Value")}</th><th>{t("Actions")}</th></tr></thead>
   <tbody>{shown.map(r => <tr key={r.id} {...(transactions?{className:'clickable-row',tabIndex:0,'aria-label':t('View details for {name}',{name:r.name}),onClick:(event:ReactMouseEvent)=>{if(!(event.target as HTMLElement).closest('button,a,input'))setViewing(r);},onKeyDown:(event:ReactKeyboardEvent)=>{if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();setViewing(r);}}}:{})}>
    <td><div className="record-name"><RecordIcon record={r} /><div><strong>{r.name}</strong>{r.kind === 'Mortgage' && (r.estimated_monthly_payment ?? 0) > 0 && <small>{t("Estimated payment: {amount}/month", { amount: money(r.estimated_monthly_payment!, r.currency) })}</small>}{r.mortgage_payment_id && <small>{t("Mortgage payment · Principal: {principal} · Interest: {interest}", { principal: money(Number(r.payment_principal), r.currency), interest: money(Number(r.payment_interest), r.currency) })}</small>}{['Business', 'Property'].includes(r.kind) && (r.estimated_monthly_income ?? 0) > 0 && <small>{t("Estimated income: {amount}/month", { amount: money(r.estimated_monthly_income!, r.currency) })}</small>}{r.kind === 'Business' && <small>{t("Ownership: {percentage}%", { percentage: formatNumber(r.ownership_percentage ?? 100, locale) })}</small>}{r.business_id && <small>{t("Business: {name}", { name: availableBusinesses.find(b => b.id === r.business_id)?.name || t("Business") })}</small>}{<small>{['Stock', 'Crypto'].includes(r.kind) ? t('{quantity} units · Gain/loss {amount}', { quantity: formatNumber(r.quantity, locale), amount: money((r.amount - r.cost) * r.quantity, r.currency) }) : r.frequency === 'Once' ? (r.rate ? t('{rate}% annual interest', { rate: formatNumber(r.rate, locale) }) : r.notes || t("One-time record")) : t(r.frequency)}</small>}{['Stock', 'Crypto'].includes(r.kind) && <><small>{t('{price} per unit', { price: formatMoney(r.amount, r.currency, locale, true) })}</small><small>{quoteLabel(r)}</small></>}</div></div></td>
    <td><CategoryBadge kind={r.kind} label={t(r.payment_type==='bonus'?'Bonus':r.kind)}/>{r.custom_category_id&&<CategoryBadge kind={r.custom_category_id} label={planning.data.categories.find(c=>c.id===r.custom_category_id)?.name??t('Custom category')}/>}</td>
    <td className="muted">{r.kind === 'Money lent' ? <><div>{t("Lent: {date}", { date: date(r.lent_date || '') })}</div><small>{r.date ? t("Due: {date}", { date: date(r.date) }) : t("No due date")}</small></> : liabilities.includes(r.kind)?<><div>{t('Started: {date}',{date:date(r.opened_on||'')})}</div><small>{t('Due: {date}',{date:date(r.date)})}</small></>:date(r.date)}</td>
    <td className={transactions?`amount ${income.includes(r.kind)?'positive':'negative'}`:"amount"}>{transactions?`${income.includes(r.kind)?'+':'−'}${money(value(r),r.currency)}`:money(value(r), r.currency)}</td>
    <td><div className="row-actions">{[...income,...expenses].includes(r.kind)&&r.frequency!=='Once'&&!r.end_date&&<Button size="sm" variant="outline" onClick={()=>setStopping(saved(r))}>{t("Stop")}</Button>}{!demo && trackedKinds.includes(r.kind) && <Button size="sm" variant="outline" onClick={() => setTracking(saved(r))}>{t("Tracker")}</Button>}{r.kind === 'Mortgage' && <Button size="sm" variant="outline" onClick={() => setPayingMortgage(saved(r))}>{t("Record payment")}</Button>}{!r.movement_id && !r.operation_id && !r.mortgage_payment_id && !r.history_event_id && <>{isTransactionHistory(r)&&<Button variant="outline" size="sm" disabled={transactionTools.loading||!!transactionTools.error} onClick={()=>setSplitting(historyPage.data.records.find(record=>record.id===r.id)||planning.data.records.find(record=>record.id===r.id)||r)}>{t('Split')}</Button>}<Button size="icon" variant="ghost" aria-label={t('Edit {name}', { name: r.name })} onClick={() => editRecord(r)}><Pencil size={15}/></Button><Button size="icon" variant="ghost" aria-label={t('Delete {name}', { name: r.name })} onClick={() => requestDelete(r)}><Trash2 size={15}/></Button></>}</div></td>
   </tr>)}</tbody>
  </table></div> : <div className="empty"><Wallet /><h3>{t(filtersActive?'No matching records.':'A fresh start.')}</h3><p>{t(filtersActive?'Try another search or clear the filters.':'Add a record in {currency} to start building your overview.', { currency })}</p>{filtersActive&&<Button variant="outline" onClick={()=>setFilters(emptyRecordFilters)}>{t('Clear filters')}</Button>}<Button variant="outline" onClick={addRecord}><Plus />{transactions ? t("Add your first expense") : t("Add your first record")}</Button></div>}
  {children}
  {!tableLoading && pagination && <nav className="records-pagination" aria-label={t('Record pages')}><span>{t('Page {page} of {pages} · {count} records', { page: formatNumber(tablePage, locale, 0), pages: formatNumber(pageCount, locale, 0), count: formatNumber(totalRecords, locale, 0) })}</span><div><Button variant="outline" disabled={tableLoading || recordsLoading || busy || tablePage <= 1} onClick={() => showPage(tablePage - 1)}>{t('Previous')}</Button><Button variant="outline" disabled={tableLoading || recordsLoading || busy || tablePage >= pageCount} onClick={() => showPage(tablePage + 1)}>{t('Next')}</Button></div></nav>}
 </section>;
}

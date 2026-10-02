"use client";
import {StatementReconciliation} from './statement-reconciliation';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import {CorporateEventDialog} from './corporate-event-dialog';
import Link from 'next/link';
import { PageHeader } from '@/components/presentation-foundation/page-header';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { useState, type ReactNode } from 'react';
import { ArrowRightLeft, Bitcoin, ChartNoAxesCombined, ChevronDown, ChevronRight, Landmark, MoreHorizontal, Plus, Search, Wallet } from 'lucide-react';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { Count } from '@/components/presentation-foundation/count';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { accountActivityPage } from '@/lib/account-activity-page';
import { useLanguage } from '@/components/language-provider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { holdingAccountLabel, holdingAccountValue, type HoldingAccount } from '@/lib/holding-accounts';
import { income, value, type Entry } from '@/lib/finance';
import { decimalSum } from '@/lib/decimal-amounts';
import { marketEntry, type MarketData } from '@/lib/market';
import { AssetMovementDialog, type MovementDraft } from './asset-movement-dialog';
import { isHolding } from '@/lib/asset-movements';
import { AccountOperation, type Operation } from './account-operation';
import { HoldingAccountDialog } from './holding-account-dialog';
import type { PlanningData } from '@/lib/planning';
import { SortableItem, SortableList } from '@/components/presentation-foundation/sortable';
import { useDisplayOrder } from '@/hooks/use-display-order';
import type { PreferenceResource } from '@/hooks/use-workspace-preferences';
import { accountHasLinks, linkedAccountMessage } from '@/lib/account-deletion';
import { showError } from '@/lib/feedback';

type Props = {
 owner:string|null; onSaved:()=>void;
 data: PlanningData; save: (action: string, data: unknown) => Promise<void>;
 onAdd: (kind: 'Cash'|'Deposit'|'Stock'|'Crypto', accountId?: string) => void;
 onEdit: (record: Entry) => void; onTrack?: (record: Entry) => void; onDelete: (record: Entry) => void;
 demo: boolean; preferences: PreferenceResource;
 market: MarketData|null; currencies: string[]; currency: string;
 saveAccount: (account: HoldingAccount) => Promise<void>;
 assignHolding: (record: Entry, accountId: string|null) => Promise<void>;
};

function AccountMenu({ name, children }: { name: string; children: ReactNode }) {
 const { t } = useLanguage();
 return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="account-card-menu" aria-label={`${t('Account actions')}: ${name}`}><MoreHorizontal size={20} aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="account-menu-content">{children}</DropdownMenuContent></DropdownMenu>;
}

function HoldingRow({ record, accounts, market, onEdit, onTrack, assignHolding, onMove,onCorporate }: { onCorporate:(record:Entry)=>void; onMove:(draft:MovementDraft)=>void; record: Entry; accounts: HoldingAccount[]; market: MarketData|null; onEdit: Props['onEdit']; onTrack: Props['onTrack']; assignHolding: Props['assignHolding'] }) {
 const { t, locale } = useLanguage();
 const [busy, setBusy] = useState(false), [error, setError] = useState('');
 const priced = marketEntry(record, record.currency, market) ?? record;
 return <li className="account-holding-row"><CategoryIcon kind={record.kind}/><div><strong>{record.name}</strong><p className="muted">{isHolding(record)?<>{t('{quantity} units', { quantity: formatNumber(record.quantity, locale) })} · {formatMoney(priced.amount, record.currency, locale, true)} {t('per unit')}</>:t('Available cash')}</p></div><strong className="account-holding-value">{formatMoney(value(priced), record.currency, locale)}</strong>
  <div className="account-holding-actions"><label><span className="sr-only">{t('Investment account')}</span><NativeSelect value={record.holding_account_id??''} disabled={busy} onChange={async event=>{const accountId=event.target.value||null;setBusy(true);setError('');try{await assignHolding(record,accountId);}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}><option value="">{t('No investment account')}</option>{accounts.filter(account=>record.kind==='Cash'||account.kind===record.kind).map(account=><option key={account.id} value={account.id}>{account.name}</option>)}</NativeSelect></label><AccountMenu name={record.name}>{isHolding(record)&&<><DropdownMenuItem onSelect={()=>onMove({kind:'buy',target_id:record.id})}>{t('Buy')}</DropdownMenuItem><DropdownMenuItem onSelect={()=>onMove({kind:'sell',source_id:record.id})}>{t('Sell / convert')}</DropdownMenuItem><DropdownMenuItem onSelect={()=>onCorporate(record)}>{t('Investment events')}</DropdownMenuItem></>}{onTrack&&<DropdownMenuItem onSelect={()=>onTrack(record)}>{t('Tracker')}</DropdownMenuItem>}<DropdownMenuItem onSelect={()=>onEdit(record)}>{t('Edit')}</DropdownMenuItem></AccountMenu></div>
  <ErrorPopup message={error}/>
 </li>;
}

export function AccountsPage({ owner,onSaved,data, save, onAdd, onEdit, onTrack, onDelete, demo, preferences, market, currencies, currency, saveAccount, assignHolding }: Props) {
 const { t, locale } = useLanguage();
 const [statement,setStatement]=useState<Entry|null>(null),[corporate,setCorporate]=useState<Entry|null>(null);
 const [movement,setMovement]=useState<MovementDraft|null>(null);
 const [operation, setOperation] = useState<Operation|null>(null), [choosing, setChoosing] = useState(false), [draft, setDraft] = useState<HoldingAccount|null>(null);
 const [query,setQuery]=useState(''),[selected,setSelected]=useState<string|null>(null);
 const [activityPage,setActivityPage]=useState({owner,page:1});
 const activity=accountActivityPage(data,activityPage.owner===owner?activityPage.page:1);
 const cash = data.records.filter(record=>record.kind==='Cash');
 const balances = data.records.filter(record=>(record.kind==='Cash'&&!record.holding_account_id)||record.kind==='Deposit');
 const investmentAccounts = data.holdingAccounts??[];
 const unassigned = data.records.filter(record=>['Stock','Crypto'].includes(record.kind)&&!record.holding_account_id);
 const unorderedItems = [
  ...balances.map(account=>({key:`record:${account.id}`,account,total:account.amount,group:account.kind==='Deposit'?'deposits':'cash',count:null as number|null})),
  ...investmentAccounts.map(account=>{const {total,holdings}=holdingAccountValue(account,data.records,market);return {key:`investment:${account.id}`,account,total,group:'investments',count:holdings.filter(isHolding).length};}),
 ].map(item=>({...item,id:item.account.id}));
 // Accounts keep the order the person drags them into within their group.
 const order=useDisplayOrder('account_order',unorderedItems,preferences,owner,demo);
 const accountItems=order.items;
 const remove=(account:Entry)=>{if(accountHasLinks(account.id,data))showError(linkedAccountMessage);else onDelete(account);};
 const visibleAccounts=accountItems.filter(item=>item.account.name.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)));
 const active=visibleAccounts.find(item=>item.key===selected)??visibleAccounts[0];
 const summaryCurrencies=Array.from(new Set(accountItems.map(item=>item.account.currency)));
  const rows = (records: Entry[]) => <ul className="account-holdings">{records.map(record=><HoldingRow key={record.id} record={record} accounts={investmentAccounts} market={market} onEdit={onEdit} onTrack={onTrack} assignHolding={assignHolding} onMove={setMovement} onCorporate={setCorporate}/>)}</ul>;
 return <>
  <PageHeader title={t('Accounts')}><Button variant="outline" onClick={()=>setMovement({kind:'transfer'})}><ArrowRightLeft size={17} aria-hidden="true"/>{t('Transfer money')}</Button><Button onClick={()=>setChoosing(true)}><Plus size={17} aria-hidden="true" />{t('Add account')}</Button></PageHeader>
  {!!accountItems.length&&<StatTiles columns="auto" label={t('About account totals')}>
   {summaryCurrencies.map(code=>{const items=accountItems.filter(item=>item.account.currency===code);const total=items.some(item=>item.total===null)?null:items.reduce((sum,item)=>sum+(item.total??0),0);return <StatTile key={code} label={t('{currency} balances',{currency:code})} value={total===null?'—':formatMoney(total,code,locale)}/>;})}
  </StatTiles>}
  {!!accountItems.length&&<div className="accounts-master-detail">
   <section className="account-directory" aria-label={t('Accounts')}>
    {accountItems.length>6&&<label className="account-search"><Search size={18} aria-hidden="true"/><Input aria-label={t('Search accounts')} placeholder={t('Search accounts...')} value={query} onChange={event=>setQuery(event.target.value)}/></label>}
    {[['cash','Cash'],['deposits','Deposits'],['investments','Investments']].map(([group,label])=>{const items=visibleAccounts.filter(item=>item.group===group);// One total per currency: balances in different currencies are never added together here.
const total=items.every(item=>item.total!==null)?[...new Set(items.map(item=>item.account.currency))].map(code=>formatMoney(items.filter(item=>item.account.currency===code).reduce((sum,item)=>sum+(item.total??0),0),code,locale)).join(' · '):null;return items.length>0&&<details className="panel account-group" key={group} open>
     <summary><ChevronDown size={18} aria-hidden="true"/><h2>{t(label)}</h2><Count value={items.length}/>{total&&<strong>{total}</strong>}</summary>
     <SortableList id={`accounts-${group}`} items={items.map(item=>item.id)} nameOf={id=>items.find(item=>item.id===id)?.account.name??''} onMove={(moved,over)=>void order.reorder(moved,over,items.map(item=>item.id))} disabled={order.disabled}>
      {items.map(item=><SortableItem key={item.key} id={item.id} label={item.account.name} className="account-sortable-row"><button type="button" className="account-list-row" aria-pressed={active?.key===item.key} onClick={()=>setSelected(item.key)}><CategoryIcon kind={item.account.kind}/><span className="account-list-name">{item.account.name}<small>{item.count!==null?t('{count} holdings',{count:formatNumber(item.count,locale,0)}):t(item.account.kind==='Deposit'?'Deposit':'Cash account')}</small></span><strong>{item.total===null?'—':formatMoney(item.total,item.account.currency,locale)}</strong><ChevronRight size={18} aria-hidden="true"/></button></SortableItem>)}
     </SortableList>
    </details>;})}
    {!visibleAccounts.length&&<p className="account-search-empty muted">{t('No accounts match your search.')}</p>}
   </section>
   <div className="account-selected-panel">
   {balances.filter(account=>active?.key===`record:${account.id}`).map(account=><article className="panel account-card" key={account.id}>
    <header><CategoryIcon kind={account.kind}/><div className="account-card-heading"><h2>{account.name}</h2><small>{t(account.kind==='Deposit'?'Deposit':'Cash account')}</small></div><AccountMenu name={account.name}><DropdownMenuItem onSelect={()=>onEdit(account)}>{t('Edit')}</DropdownMenuItem>{account.kind==='Deposit'&&<DropdownMenuItem onSelect={()=>setMovement({kind:'interest',source_id:account.id})}>{t('Record capitalized interest')}</DropdownMenuItem>}{account.kind==='Deposit'&&onTrack&&<DropdownMenuItem onSelect={()=>onTrack(account)}>{t('Manage deposit')}</DropdownMenuItem>}<DropdownMenuItem variant="destructive" onSelect={()=>remove(account)}>{t('Delete')}</DropdownMenuItem></AccountMenu></header>
    <strong className="account-card-value">{formatMoney(account.amount,account.currency,locale)}</strong>
    {account.kind==='Cash'?<dl className="account-balance-facts"><div><dt>{t('Allocated to goals')}</dt><dd>{formatMoney(data.goals.filter(goal=>goal.account_id===account.id&&!goal.archived).reduce((sum,goal)=>sum+Number(goal.allocated),0),account.currency,locale)}</dd></div><div><dt>{t('Available')}</dt><dd>{formatMoney(account.amount-data.goals.filter(goal=>goal.account_id===account.id&&!goal.archived).reduce((sum,goal)=>sum+Number(goal.allocated),0),account.currency,locale)}</dd></div></dl>:<p className="muted">{t('{rate}% annual interest',{rate:formatNumber(account.rate,locale)})}</p>}
    <div className="account-card-actions">{account.kind==='Cash'&&<Button aria-disabled={!owner||undefined} title={owner?undefined:t('Available after you sign in.')} onClick={()=>{if(owner)setStatement(account);}}>{t('Reconcile statement')}</Button>}{account.kind==='Deposit'?<><Button onClick={()=>setMovement({kind:'transfer',target_id:account.id})}><Plus size={16} aria-hidden="true" />{t('Top-up')}</Button><Button variant="outline" onClick={()=>setMovement({kind:'transfer',source_id:account.id})}>{t('Withdraw')}</Button></>:<Button variant="outline" onClick={()=>setOperation({action:'reconcile',account_id:account.id,amount:account.amount})}>{t('Adjust balance')}</Button>}</div>
    {account.kind==='Deposit'&&<Dialog><DialogTrigger asChild><Button variant="ghost" className="account-details-trigger">{t('Account details')}</Button></DialogTrigger><DialogContent aria-describedby={undefined}><DialogTitle>{account.name} · {t('Account details')}</DialogTitle><dl className="account-card-facts">{onTrack&&<div><dt>{t('Estimated monthly interest')}</dt><dd>{account.estimated_monthly_income==null?'—':formatMoney(account.estimated_monthly_income,account.currency,locale)}</dd></div>}<div><dt>{t('Due / maturity date')}</dt><dd>{formatDate(account.date,locale)}</dd></div></dl></DialogContent></Dialog>}

   </article>)}
   {investmentAccounts.filter(account=>active?.key===`investment:${account.id}`).map(account=>{
    const {holdings,total}=holdingAccountValue(account,data.records,market);
    return <article className="panel account-card" key={account.id}>
     <header><CategoryIcon kind={account.kind}/><div className="account-card-heading"><h2>{account.name}</h2><small>{t(holdingAccountLabel(account.kind))}</small></div><AccountMenu name={account.name}><DropdownMenuItem onSelect={()=>setDraft(account)}>{t('Edit account')}</DropdownMenuItem><DropdownMenuItem onSelect={()=>onAdd('Cash',account.id)}>{t('Add cash balance')}</DropdownMenuItem></AccountMenu></header>
     <strong className="account-card-value">{total===null?'—':formatMoney(total,account.currency,locale)}</strong><p className="muted">{t('{count} holdings',{count:formatNumber(holdings.filter(isHolding).length,locale,0)})} · {account.currency}</p>
     {total===null&&<p className="muted">{t('Exchange rates are missing. The account total is unavailable.')}</p>}
     <div className="account-card-actions"><Button onClick={()=>onAdd(account.kind,account.id)}><Plus size={16} aria-hidden="true" />{t(account.kind==='Cash'?'Add cash balance':'Add holding')}</Button></div>
     {holdings.length>0&&<Dialog><DialogTrigger asChild><Button variant="ghost" className="account-details-trigger">{t('Holdings')}</Button></DialogTrigger><DialogContent className="record-dialog" aria-describedby={undefined}><DialogTitle>{account.name} · {t('Holdings')}</DialogTitle>{rows(holdings)}</DialogContent></Dialog>}
    </article>;
   })}
   </div>
  </div>}
  {!balances.length&&!investmentAccounts.length&&<EmptyState className="panel" icon={<Wallet aria-hidden="true"/>} description={t('Add a cash, deposit, stock or crypto account to get started.')}><Button onClick={()=>setChoosing(true)}><Plus size={17} aria-hidden="true"/>{t('Add account')}</Button></EmptyState>}
  {!!unassigned.length&&<section className="panel account-unassigned"><PanelTitle title={t('Holdings without an account')} hint={t('Assign existing holdings to an account without changing their value or cash balances.')}/>{rows(unassigned)}</section>}
  <section className="panel account-activity"><PanelTitle title={t('Recent activity')} hint={t('Account totals use current quotes where available and saved prices otherwise. Holdings are counted once in your assets.')}><Link className="panel-link" href="/assets">{t('View all assets')}</Link></PanelTitle>{activity.activity.length>0&&<div className="table-scroll"><table><thead><tr><th>{t('Date')}</th><th>{t('Account')}</th><th>{t('Activity')}</th><th>{t('Amount')}</th><th>{t('Balance after')}</th></tr></thead><tbody>{activity.activity.map(item=>{const account=cash.find(a=>a.id===item.account_id);return <tr key={item.id}><td>{formatDate(item.occurred_on,locale)}</td><td>{account?.name??'—'}</td><td>{t(({transfer:'Transfer money',reconcile:'Reconcile balance',repayment:'Record repayment',mortgage:'Record mortgage payment'} as Record<string,string>)[item.action]??item.action)}{item.target_id&&<small className="block">{data.records.find(record=>record.id===item.target_id)?.name}</small>}{item.notes&&<small className="block">{item.notes}</small>}</td><td>{formatMoney(item.action==='mortgage'?decimalSum([item.amount,item.fee]):item.amount,account?.currency??currencies[0],locale)}</td><td>{formatMoney(item.after_balance,account?.currency??currencies[0],locale)}</td></tr>;})}</tbody></table></div>}{!activity.total&&<p className="muted">{t('No account operations yet.')}</p>}
   {activity.movements.length ? <div className="table-scroll"><table><thead><tr><th>{t('Date')}</th><th>{t('Activity')}</th><th>{t('From')}</th><th>{t('To')}</th></tr></thead><tbody>{activity.movements.map(item=>{const source=data.records.find(record=>record.id===item.source_id),target=data.records.find(record=>record.id===item.target_id);const amount=(record:Entry|undefined,n:number)=>record&&isHolding(record)?t('{quantity} units',{quantity:formatNumber(n,locale,8)}):formatMoney(n,record?.currency??currencies[0],locale);return <tr key={item.id}><td>{formatDate(item.occurred_on,locale)}</td><td>{t(({transfer:'Transfer money',buy:'Buy holding',sell:'Sell / convert holding',interest:'Record capitalized interest'})[item.kind])}{item.notes&&<small className="block">{item.notes}</small>}</td><td>{item.kind==='interest'?'—':<>{source?.name}<small className="block">{amount(source,item.sent)}</small></>}</td><td>{target?.name}<small className="block">{amount(target,item.received)}</small></td></tr>;})}</tbody></table></div>:null}{(activity.records.length>0||activity.investmentLinks.length>0)&&<><h3>{t('Income & expenses')}</h3><div className="table-scroll"><table><tbody>{activity.records.map(record=><tr key={record.id}><td>{formatDate(record.date,locale)}</td><td>{record.name}</td><td>{cash.find(account=>account.id===record.account_id)?.name}</td><td>{formatMoney(income.includes(record.kind)?record.amount:-record.amount,record.currency,locale)}</td></tr>)}{activity.investmentLinks.map(link=>{const account=cash.find(a=>a.id===link.account_id);return <tr key={link.id}><td>{formatDate(link.investment_history.occurred_on,locale)}</td><td>{data.records.find(record=>record.id===link.investment_history.record_id)?.name}</td><td>{account?.name}</td><td>{formatMoney(link.amount,account?.currency??currencies[0],locale)}</td></tr>;})}</tbody></table></div></>}
   <nav className="records-pagination" aria-label={t('Account activity')}><span>{t('Page {page} of {pages} · {count} records',{page:formatNumber(activity.page,locale,0),pages:formatNumber(activity.pages,locale,0),count:formatNumber(activity.total,locale,0)})}</span><div><Button variant="outline" disabled={activity.page<=1} onClick={()=>setActivityPage({owner,page:activity.page-1})}>{t('Previous')}</Button><Button variant="outline" disabled={activity.page>=activity.pages} onClick={()=>setActivityPage({owner,page:activity.page+1})}>{t('Next')}</Button></div></nav>
  </section>
  <Dialog open={choosing} onOpenChange={setChoosing}><DialogContent className="record-dialog"><DialogTitle>{t('Add account')}</DialogTitle><DialogDescription>{t('Choose what you want to keep in this account.')}</DialogDescription><div className="account-type-options">
   {([{kind:'CashInvestment',title:'Cash investment account',description:'Hold cash in your preferred currencies as an investment.',Icon:Wallet},{kind:'Cash',title:'Cash account',description:'Money available for spending, transfers and savings goals.',Icon:Wallet},{kind:'Deposit',title:'Interest-bearing deposit',description:'A balance with an annual interest rate, top-ups and withdrawals.',Icon:Landmark},{kind:'Stock',title:'Stock account',description:'A brokerage account containing multiple stock holdings.',Icon:ChartNoAxesCombined},{kind:'Crypto',title:'Crypto account',description:'An exchange or wallet containing multiple crypto holdings.',Icon:Bitcoin}] as const).map(({kind,title,description,Icon})=><button key={kind} type="button" onClick={()=>{setChoosing(false);if(kind==='Cash'||kind==='Deposit')onAdd(kind);else setDraft({id:crypto.randomUUID(),kind:kind==='CashInvestment'?'Cash':kind,name:'',currency});}}><Icon size={24} aria-hidden="true" /><span><strong>{t(title)}</strong><span>{t(description)}</span></span></button>)}
  </div></DialogContent></Dialog>
  <ErrorPopup message={order.error}/>
  {statement&&<StatementReconciliation account={statement} owner={owner} onClose={()=>setStatement(null)} onSaved={onSaved}/>}
  {corporate&&<CorporateEventDialog record={corporate} records={data.records} accounts={investmentAccounts} owner={owner} onClose={()=>setCorporate(null)} onSaved={onSaved}/>}
  {draft&&<HoldingAccountDialog currencies={currencies} account={draft} existing={investmentAccounts.some(account=>account.id===draft.id)} save={saveAccount} onClose={()=>setDraft(null)}/>}
  {movement&&<AssetMovementDialog initial={movement} records={data.records} accounts={investmentAccounts} save={payload=>save('movement',payload)} onClose={()=>setMovement(null)}/>}
  {operation&&<AccountOperation operation={operation} records={data.records} save={save} onClose={()=>setOperation(null)}/>}
 </>;
}

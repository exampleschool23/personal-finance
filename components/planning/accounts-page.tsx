"use client";
import {StatementReconciliation} from './statement-reconciliation';
import {CorporateEventDialog} from './corporate-event-dialog';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Bitcoin, ChartNoAxesCombined, CircleHelp, Landmark, MoreHorizontal, Plus, Wallet } from 'lucide-react';
import { compareRecordDates } from '@/lib/record-dates';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CategoryBadge } from '@/components/category-badge';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { holdingAccountLabel, holdingAccountValue, type HoldingAccount } from '@/lib/holding-accounts';
import { value, type Entry } from '@/lib/finance';
import { marketEntry, type MarketData } from '@/lib/market';
import { AssetMovementDialog, type MovementDraft } from './asset-movement-dialog';
import { isHolding } from '@/lib/asset-movements';
import { AccountOperation, type Operation } from './account-operation';
import { HoldingAccountDialog } from './holding-account-dialog';
import type { PlanningData } from '@/lib/planning';

type Props = {
 owner:string|null; onSaved:()=>void;
 data: PlanningData; save: (action: string, data: unknown) => Promise<void>;
 onAdd: (kind: 'Cash'|'Deposit'|'Stock'|'Crypto', accountId?: string) => void;
 onEdit: (record: Entry) => void; onTrack?: (record: Entry) => void;
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
 return <li className="account-holding-row"><div><strong>{record.name}</strong><p className="muted">{isHolding(record)?<>{t('{quantity} units', { quantity: formatNumber(record.quantity, locale) })} · {formatMoney(priced.amount, record.currency, locale, true)} {t('per unit')}</>:t('Available cash')}</p></div><strong className="account-holding-value">{formatMoney(value(priced), record.currency, locale)}</strong>
  <div className="account-holding-actions"><label>{t('Investment account')}<NativeSelect value={record.holding_account_id??''} disabled={busy} onChange={async event=>{const accountId=event.target.value||null;setBusy(true);setError('');try{await assignHolding(record,accountId);}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}}><option value="">{t('No investment account')}</option>{accounts.filter(account=>record.kind==='Cash'||account.kind===record.kind).map(account=><option key={account.id} value={account.id}>{account.name}</option>)}</NativeSelect></label>{isHolding(record)&&<><Button variant="outline" onClick={()=>onMove({kind:'buy',target_id:record.id})}>{t('Buy')}</Button><Button variant="outline" onClick={()=>onMove({kind:'sell',source_id:record.id})}>{t('Sell / convert')}</Button><Button variant="outline" onClick={()=>onCorporate(record)}>{t('Investment events')}</Button></>}{onTrack&&<Button variant="outline" onClick={()=>onTrack(record)}>{t('Tracker')}</Button>}<Button variant="ghost" onClick={()=>onEdit(record)}>{t('Edit')}</Button></div>
  {error&&<p className="error" role="alert">{t(error)}</p>}
 </li>;
}

export function AccountsPage({ owner,onSaved,data, save, onAdd, onEdit, onTrack, market, currencies, currency, saveAccount, assignHolding }: Props) {
 const { t, locale } = useLanguage();
 const [statement,setStatement]=useState<Entry|null>(null),[corporate,setCorporate]=useState<Entry|null>(null);
 const [movement,setMovement]=useState<MovementDraft|null>(null);
 const [operation, setOperation] = useState<Operation|null>(null), [choosing, setChoosing] = useState(false), [draft, setDraft] = useState<HoldingAccount|null>(null);
 const cash = data.records.filter(record=>record.kind==='Cash');
 const balances = data.records.filter(record=>(record.kind==='Cash'&&!record.holding_account_id)||record.kind==='Deposit');
 const investmentAccounts = data.holdingAccounts??[];
 const unassigned = data.records.filter(record=>['Stock','Crypto'].includes(record.kind)&&!record.holding_account_id);
 const rows = (records: Entry[]) => <ul className="account-holdings">{records.map(record=><HoldingRow key={record.id} record={record} accounts={investmentAccounts} market={market} onEdit={onEdit} onTrack={onTrack} assignHolding={assignHolding} onMove={setMovement} onCorporate={setCorporate}/>)}</ul>;
 return <>
  <div className="page-heading"><div><h1>{t('Accounts')}</h1><p className="muted">{t('Cash, deposits and investment accounts in one place.')}</p></div><div className="entry-actions"><Button variant="outline" onClick={()=>setMovement({kind:'transfer'})}>{t('Transfer money')}</Button><Button onClick={()=>setChoosing(true)}><Plus size={18} aria-hidden="true" />{t('Add account')}</Button></div></div>
  <div className="account-method account-overview-links muted"><Link href="/assets">{t('View all assets')}</Link>{!!investmentAccounts.length&&<Dialog><DialogTrigger asChild><Button variant="ghost" size="icon" aria-label={t('About account totals')}><CircleHelp size={18} aria-hidden="true" /></Button></DialogTrigger><DialogContent><DialogTitle>{t('About account totals')}</DialogTitle><DialogDescription>{t('Account totals use current quotes where available and saved prices otherwise. Holdings are counted once in your assets.')}</DialogDescription></DialogContent></Dialog>}</div>
  <div className="planning-cards account-cards">
   {balances.map(account=><article className="panel account-card" key={account.id}>
    <header><span className="account-card-icon">{account.kind==='Deposit'?<Landmark aria-hidden="true" />:<Wallet aria-hidden="true" />}</span><div className="account-card-heading"><CategoryBadge kind={account.kind} label={t(account.kind==='Deposit'?'Deposit':'Cash account')}/><h2>{account.name}</h2></div><AccountMenu name={account.name}><DropdownMenuItem onSelect={()=>onEdit(account)}>{t('Edit')}</DropdownMenuItem>{account.kind==='Deposit'&&<DropdownMenuItem onSelect={()=>setMovement({kind:'interest',source_id:account.id})}>{t('Record capitalized interest')}</DropdownMenuItem>}{account.kind==='Deposit'&&onTrack&&<DropdownMenuItem onSelect={()=>onTrack(account)}>{t('Manage deposit')}</DropdownMenuItem>}</AccountMenu></header>
    <strong className="account-card-value">{formatMoney(account.amount,account.currency,locale)}</strong>
    {account.kind==='Cash'?<p className="muted">{t('Allocated to goals')}: {formatMoney(data.goals.filter(goal=>goal.account_id===account.id&&!goal.archived).reduce((sum,goal)=>sum+Number(goal.allocated),0),account.currency,locale)}</p>:<p className="muted">{t('{rate}% annual interest',{rate:formatNumber(account.rate,locale)})}</p>}
    <div className="account-card-actions">{account.kind==='Cash'&&<Button disabled={!owner} variant="outline" onClick={()=>setStatement(account)}>{t('Reconcile statement')}</Button>}{account.kind==='Deposit'?<><Button onClick={()=>setMovement({kind:'transfer',target_id:account.id})}><Plus size={16} aria-hidden="true" />{t('Top-up')}</Button><Button variant="outline" onClick={()=>setMovement({kind:'transfer',source_id:account.id})}>{t('Withdraw')}</Button></>:<Button variant="outline" onClick={()=>setOperation({action:'reconcile',account_id:account.id,amount:account.amount})}>{t('Adjust current balance')}</Button>}</div>
    {account.kind==='Deposit'&&<Dialog><DialogTrigger asChild><Button variant="ghost" className="account-details-trigger">{t('Account details')}</Button></DialogTrigger><DialogContent aria-describedby={undefined}><DialogTitle>{account.name} · {t('Account details')}</DialogTitle><dl className="account-card-facts">{onTrack&&<div><dt>{t('Estimated monthly interest')}</dt><dd>{account.estimated_monthly_income==null?'—':formatMoney(account.estimated_monthly_income,account.currency,locale)}</dd></div>}<div><dt>{t('Due / maturity date')}</dt><dd>{formatDate(account.date,locale)}</dd></div></dl></DialogContent></Dialog>}

   </article>)}
   {investmentAccounts.map(account=>{
    const {holdings,total}=holdingAccountValue(account,data.records,market);
    return <article className="panel account-card" key={account.id}>
     <header><span className="account-card-icon">{account.kind==='Cash'?<Wallet aria-hidden="true" />:account.kind==='Stock'?<ChartNoAxesCombined aria-hidden="true" />:<Bitcoin aria-hidden="true" />}</span><div className="account-card-heading"><CategoryBadge kind={account.kind} label={t(holdingAccountLabel(account.kind))}/><h2>{account.name}</h2></div><AccountMenu name={account.name}><DropdownMenuItem onSelect={()=>setDraft(account)}>{t('Edit account')}</DropdownMenuItem><DropdownMenuItem onSelect={()=>onAdd('Cash',account.id)}>{t('Add cash balance')}</DropdownMenuItem></AccountMenu></header>
     <strong className="account-card-value">{total===null?'—':formatMoney(total,account.currency,locale)}</strong><p className="muted">{t('{count} holdings',{count:formatNumber(holdings.filter(isHolding).length,locale,0)})} · {account.currency}</p>
     {total===null&&<p className="muted">{t('Exchange rates are missing. The account total is unavailable.')}</p>}
     <div className="account-card-actions"><Button onClick={()=>onAdd(account.kind,account.id)}><Plus size={16} aria-hidden="true" />{t(account.kind==='Cash'?'Add cash balance':'Add holding')}</Button></div>
     {holdings.length>0&&<Dialog><DialogTrigger asChild><Button variant="ghost" className="account-details-trigger">{t('Holdings')}</Button></DialogTrigger><DialogContent className="record-dialog" aria-describedby={undefined}><DialogTitle>{account.name} · {t('Holdings')}</DialogTitle>{rows(holdings)}</DialogContent></Dialog>}
    </article>;
   })}
  </div>
  {!balances.length&&!investmentAccounts.length&&<div className="panel empty"><p>{t('Add a cash, deposit, stock or crypto account to get started.')}</p><Button onClick={()=>setChoosing(true)}>{t('Add account')}</Button></div>}
  {!!unassigned.length&&<section className="panel account-unassigned"><h2>{t('Holdings without an account')}</h2><p className="muted">{t('Assign existing holdings to an account without changing their value or cash balances.')}</p>{rows(unassigned)}</section>}
  <section className="panel account-activity"><h2>{t('Account activity')}</h2><div className="table-scroll"><table><thead><tr><th>{t('Date')}</th><th>{t('Account')}</th><th>{t('Activity')}</th><th>{t('Amount')}</th><th>{t('Balance after')}</th></tr></thead><tbody>{[...data.activity].sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on)).map(item=>{const account=cash.find(a=>a.id===item.account_id);return <tr key={item.id}><td>{formatDate(item.occurred_on,locale)}</td><td>{account?.name??'—'}</td><td>{t(({transfer:'Transfer money',reconcile:'Reconcile balance',repayment:'Record repayment',mortgage:'Record mortgage payment'} as Record<string,string>)[item.action]??item.action)}{item.target_id&&<small className="block">{data.records.find(record=>record.id===item.target_id)?.name}</small>}{item.notes&&<small className="block">{item.notes}</small>}</td><td>{formatMoney(item.amount,account?.currency??currencies[0],locale)}</td><td>{formatMoney(item.after_balance,account?.currency??currencies[0],locale)}</td></tr>;})}</tbody></table></div>{!data.activity.length&&!data.movements?.length&&<p className="muted">{t('No account operations yet.')}</p>}
   {data.movements?.length ? <div className="table-scroll"><table><thead><tr><th>{t('Date')}</th><th>{t('Activity')}</th><th>{t('From')}</th><th>{t('To')}</th></tr></thead><tbody>{[...data.movements].sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on)).map(item=>{const source=data.records.find(record=>record.id===item.source_id),target=data.records.find(record=>record.id===item.target_id);const amount=(record:Entry|undefined,n:number)=>record&&isHolding(record)?t('{quantity} units',{quantity:formatNumber(n,locale,8)}):formatMoney(n,record?.currency??currencies[0],locale);return <tr key={item.id}><td>{formatDate(item.occurred_on,locale)}</td><td>{t(({transfer:'Transfer money',buy:'Buy holding',sell:'Sell / convert holding',interest:'Record capitalized interest'})[item.kind])}{item.notes&&<small className="block">{item.notes}</small>}</td><td>{item.kind==='interest'?'—':<>{source?.name}<small className="block">{amount(source,item.sent)}</small></>}</td><td>{target?.name}<small className="block">{amount(target,item.received)}</small></td></tr>;})}</tbody></table></div>:null}<h3>{t('Income & expenses')}</h3><div className="table-scroll"><table><tbody>{data.records.filter(record=>record.account_id).sort((a,b)=>compareRecordDates(a.date,b.date)).map(record=><tr key={record.id}><td>{formatDate(record.date,locale)}</td><td>{record.name}</td><td>{cash.find(account=>account.id===record.account_id)?.name}</td><td>{formatMoney(record.amount,record.currency,locale)}</td></tr>)}{(data.investmentLinks??[]).map(link=>{const account=cash.find(a=>a.id===link.account_id);return <tr key={link.id}><td>{formatDate(link.investment_history.occurred_on,locale)}</td><td>{data.records.find(record=>record.id===link.investment_history.record_id)?.name}</td><td>{account?.name}</td><td>{formatMoney(link.amount,account?.currency??currencies[0],locale)}</td></tr>;})}</tbody></table></div>
  </section>
  <Dialog open={choosing} onOpenChange={setChoosing}><DialogContent className="record-dialog"><DialogTitle>{t('Add account')}</DialogTitle><DialogDescription>{t('Choose what you want to keep in this account.')}</DialogDescription><div className="account-type-options">
   {([{kind:'CashInvestment',title:'Cash investment account',description:'Hold cash in your preferred currencies as an investment.',Icon:Wallet},{kind:'Cash',title:'Cash account',description:'Money available for spending, transfers and savings goals.',Icon:Wallet},{kind:'Deposit',title:'Interest-bearing deposit',description:'A balance with an annual interest rate, top-ups and withdrawals.',Icon:Landmark},{kind:'Stock',title:'Stock account',description:'A brokerage account containing multiple stock holdings.',Icon:ChartNoAxesCombined},{kind:'Crypto',title:'Crypto account',description:'An exchange or wallet containing multiple crypto holdings.',Icon:Bitcoin}] as const).map(({kind,title,description,Icon})=><button key={kind} type="button" onClick={()=>{setChoosing(false);if(kind==='Cash'||kind==='Deposit')onAdd(kind);else setDraft({id:crypto.randomUUID(),kind:kind==='CashInvestment'?'Cash':kind,name:'',currency});}}><Icon size={24} aria-hidden="true" /><span><strong>{t(title)}</strong><span>{t(description)}</span></span></button>)}
  </div></DialogContent></Dialog>
  {statement&&<StatementReconciliation account={statement} owner={owner} onClose={()=>setStatement(null)} onSaved={onSaved}/>}
  {corporate&&<CorporateEventDialog record={corporate} records={data.records} accounts={investmentAccounts} owner={owner} onClose={()=>setCorporate(null)} onSaved={onSaved}/>}
  {draft&&<HoldingAccountDialog currencies={currencies} account={draft} existing={investmentAccounts.some(account=>account.id===draft.id)} save={saveAccount} onClose={()=>setDraft(null)}/>}
  {movement&&<AssetMovementDialog initial={movement} records={data.records} accounts={investmentAccounts} save={payload=>save('movement',payload)} onClose={()=>setMovement(null)}/>}
  {operation&&<AccountOperation operation={operation} records={data.records} save={save} onClose={()=>setOperation(null)}/>}
 </>;
}

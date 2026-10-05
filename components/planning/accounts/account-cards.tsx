"use client";
import { Plus } from 'lucide-react';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { AnimatedMoney } from '@/components/presentation-foundation/animated-money';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { holdingAccountLabel, holdingAccountValue, type HoldingAccount } from '@/lib/holding-accounts';
import type { Entry } from '@/lib/finance';
import { isHolding } from '@/lib/asset-movements';
import { allocatedToGoals } from '@/lib/account-directory';
import type { PlanningData } from '@/lib/planning';
import type { MovementDraft } from '../asset-movement-dialog';
import type { Operation } from '../account-operation';
import { AccountMenu } from './account-menu';
import { HoldingRows, type HoldingActions } from './holding-rows';

/** What can open from a cash account's or deposit's card. */
export type BalanceCardActions = {
 onEdit: (record: Entry) => void; onTrack?: (record: Entry) => void; onDelete: (record: Entry) => void;
 onMove: (draft: MovementDraft) => void; onOperation: (operation: Operation) => void;
 /** Reconciling a statement needs a signed-in owner; without one the button explains why it is unavailable. */
 onStatement?: (account: Entry) => void;
};

/** A cash account's goal allocations, or a deposit's interest rate. */
function BalanceFacts({ account, goals }: { account: Entry; goals: PlanningData['goals'] }) {
 const { t, locale } = useLanguage();
 if (account.kind!=='Cash') return <p className="muted">{t('{rate}% annual interest',{rate:formatNumber(account.rate,locale)})}</p>;
 const allocated=allocatedToGoals(goals,account.id);
 return <dl className="account-balance-facts"><div><dt>{t('Allocated to goals')}</dt><dd><AnimatedMoney value={allocated} currency={account.currency}/></dd></div><div><dt>{t('Available')}</dt><dd><AnimatedMoney value={account.amount-allocated} currency={account.currency}/></dd></div></dl>;
}

/** The selected cash account or deposit: its balance, what it holds for goals and its actions. */
export function BalanceAccountCard({ account, goals, onEdit, onTrack, onDelete, onMove, onOperation, onStatement }: BalanceCardActions & { account: Entry; goals: PlanningData['goals'] }) {
 const { t, locale } = useLanguage();
 const deposit=account.kind==='Deposit';
 return <article className="panel account-card">
  <header><CategoryIcon kind={account.kind}/><div className="account-card-heading"><h2>{account.name}</h2><small>{t(deposit?'Deposit':'Cash account')}</small></div><AccountMenu name={account.name}><DropdownMenuItem onSelect={()=>onEdit(account)}>{t('Edit')}</DropdownMenuItem>{deposit&&<DropdownMenuItem onSelect={()=>onMove({kind:'interest',source_id:account.id})}>{t('Record capitalized interest')}</DropdownMenuItem>}{deposit&&onTrack&&<DropdownMenuItem onSelect={()=>onTrack(account)}>{t('Manage deposit')}</DropdownMenuItem>}<DropdownMenuItem variant="destructive" onSelect={()=>onDelete(account)}>{t('Delete')}</DropdownMenuItem></AccountMenu></header>
  <strong className="account-card-value"><AnimatedMoney value={account.amount} currency={account.currency}/></strong>
  <BalanceFacts account={account} goals={goals}/>
  <div className="account-card-actions">{!deposit&&<Button aria-disabled={!onStatement||undefined} title={onStatement?undefined:t('Available after you sign in.')} onClick={()=>onStatement?.(account)}>{t('Reconcile statement')}</Button>}{deposit?<><Button onClick={()=>onMove({kind:'transfer',target_id:account.id})}><Plus size={16} aria-hidden="true" />{t('Top-up')}</Button><Button variant="outline" onClick={()=>onMove({kind:'transfer',source_id:account.id})}>{t('Withdraw')}</Button></>:<Button variant="outline" onClick={()=>onOperation({action:'reconcile',account_id:account.id,amount:account.amount})}>{t('Adjust balance')}</Button>}</div>
  {deposit&&<Dialog><DialogTrigger asChild><Button variant="ghost" className="account-details-trigger">{t('Account details')}</Button></DialogTrigger><DialogContent aria-describedby={undefined}><DialogTitle>{account.name} · {t('Account details')}</DialogTitle><dl className="account-card-facts">{onTrack&&<div><dt>{t('Estimated monthly interest')}</dt><dd>{account.estimated_monthly_income==null?'—':formatMoney(account.estimated_monthly_income,account.currency,locale)}</dd></div>}<div><dt>{t('Due / maturity date')}</dt><dd>{formatDate(account.date,locale)}</dd></div></dl></DialogContent></Dialog>}
 </article>;
}

/** The selected investment account: its value, holdings count and a dialog listing the holdings. */
export function InvestmentAccountCard({ account, records, onEditAccount, onAdd, holdingActions }: { account: HoldingAccount; records: Entry[]; onEditAccount: (account: HoldingAccount) => void; onAdd: (kind: HoldingAccount['kind'], accountId: string) => void; holdingActions: HoldingActions }) {
 const { t, locale } = useLanguage();
 const {holdings,total}=holdingAccountValue(account,records,holdingActions.market);
 return <article className="panel account-card">
  <header><CategoryIcon kind={account.kind}/><div className="account-card-heading"><h2>{account.name}</h2><small>{t(holdingAccountLabel(account.kind))}</small></div><AccountMenu name={account.name}><DropdownMenuItem onSelect={()=>onEditAccount(account)}>{t('Edit account')}</DropdownMenuItem><DropdownMenuItem onSelect={()=>onAdd('Cash',account.id)}>{t('Add cash balance')}</DropdownMenuItem></AccountMenu></header>
  <strong className="account-card-value">{total===null?'—':<AnimatedMoney value={total} currency={account.currency}/>}</strong><p className="muted">{t('{count} holdings',{count:formatNumber(holdings.filter(isHolding).length,locale,0)})} · {account.currency}</p>
  {total===null&&<p className="muted">{t('Exchange rates are missing. The account total is unavailable.')}</p>}
  <div className="account-card-actions"><Button onClick={()=>onAdd(account.kind,account.id)}><Plus size={16} aria-hidden="true" />{t(account.kind==='Cash'?'Add cash balance':'Add holding')}</Button></div>
  {holdings.length>0&&<Dialog><DialogTrigger asChild><Button variant="ghost" className="account-details-trigger">{t('Holdings')}</Button></DialogTrigger><DialogContent className="record-dialog" aria-describedby={undefined}><DialogTitle>{account.name} · {t('Holdings')}</DialogTitle><HoldingRows records={holdings} {...holdingActions}/></DialogContent></Dialog>}
 </article>;
}

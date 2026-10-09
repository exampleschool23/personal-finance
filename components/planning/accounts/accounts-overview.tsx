"use client";
import { useState } from 'react';
import { Plus, Wallet } from 'lucide-react';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { AnimatedMoney } from '@/components/presentation-foundation/animated-money';
import { BusinessFilter, type BusinessOption } from '@/components/presentation-foundation/business-filter';
import { OwnerFilter } from '@/components/presentation-foundation/owner-filter';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { Button } from '@/components/ui/button';
import type { HoldingAccount } from '@/lib/holding-accounts';
import type { PlanningData } from '@/lib/planning';
import { balanceAccounts, currencyTotals, unassignedHoldings, type DirectoryItem } from '@/lib/account-directory';
import { AccountDirectory } from './account-directory';
import { BalanceAccountCard, InvestmentAccountCard, type BalanceCardActions } from './account-cards';
import { HoldingRows, type HoldingActions } from './holding-rows';
import { BusinessHoldings } from './business-holdings';
import type { useAccountFilters } from './use-account-filters';

/** The Overview view of Accounts: the total in the display currency, the filters, the directory beside the selected account, and
 * the holdings that belong to no account yet. */
export function AccountsOverview({ items, data, filters, order, businesses, cardActions, holdingActions, onEditAccount, onAdd, onAddAccount }: { items: DirectoryItem[]; data: PlanningData; filters: ReturnType<typeof useAccountFilters>; order: Parameters<typeof AccountDirectory>[0]['order']; businesses: readonly BusinessOption[]; cardActions: BalanceCardActions; holdingActions: HoldingActions; onEditAccount: (account: HoldingAccount) => void; onAdd: (kind: HoldingAccount['kind'], accountId: string) => void; onAddAccount: () => void }) {
 const { t } = useLanguage();
 const display = useDisplayMoney();
 const totals = currencyTotals(items), total = totals.every(item => item.total !== null) ? display.sum(totals.map(item => ({ amount: item.total!, currency: item.currency }))) : null;
 const { query, setQuery, businessFilter, setBusinessFilter, owners, ownerFilter, setOwnerFilter, visible, details, businessHoldings } = filters;
 const [selected,setSelected]=useState<string|null>(null);
 const active=visible.find(item=>item.key===selected)??visible[0];
 const balances=balanceAccounts(data.records), investmentAccounts=data.holdingAccounts??[], unassigned=unassignedHoldings(data.records);
 const market=holdingActions.market;
 return <>
  {!!items.length&&<StatTiles columns="auto" label={t('About account totals')}>
   <StatTile label={t('Total')} value={total===null?'—':<AnimatedMoney value={total} currency={display.currency??totals[0]?.currency??'USD'}/>}/>
  </StatTiles>}
  {(businesses.length>0||owners.length>0)&&!!items.length&&<div className="transactions-tools">{businesses.length>0&&<BusinessFilter businesses={businesses} value={businessFilter} onChange={setBusinessFilter}/>}{owners.length>0&&<OwnerFilter owners={owners} value={ownerFilter} onChange={setOwnerFilter}/>}</div>}
  {!!items.length&&<div className="accounts-master-detail">
   <AccountDirectory count={items.length} visible={visible} activeKey={active?.key} query={query} onQuery={setQuery} onSelect={setSelected} order={order} details={details}/>
   <div className="account-selected-panel">
   {balances.filter(account=>active?.key===`record:${account.id}`).map(account=><BalanceAccountCard key={account.id} account={account} goals={data.goals} {...cardActions}/>)}
   {investmentAccounts.filter(account=>active?.key===`investment:${account.id}`).map(account=><InvestmentAccountCard key={account.id} account={account} records={data.records} onEditAccount={onEditAccount} onAdd={onAdd} holdingActions={holdingActions}/>)}
   </div>
  </div>}
  {!balances.length&&!investmentAccounts.length&&<EmptyState className="panel" icon={<Wallet aria-hidden="true"/>} description={t('Add a cash, deposit, stock or crypto account to get started.')}><Button onClick={onAddAccount}><Plus size={17} aria-hidden="true"/>{t('Add account')}</Button></EmptyState>}
  {businessHoldings.length>0&&<BusinessHoldings records={businessHoldings} market={market}/>}
  {!!unassigned.length&&<section className="panel account-unassigned"><PanelTitle title={t('Holdings without an account')} hint={t('Assign existing holdings to an account without changing their value or cash balances.')}/><HoldingRows records={unassigned} {...holdingActions}/></section>}
 </>;
}

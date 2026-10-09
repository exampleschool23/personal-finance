"use client";
import type { ReactNode } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { Count } from '@/components/presentation-foundation/count';
import { SortableItem, SortableList } from '@/components/presentation-foundation/sortable';
import { useLanguage } from '@/components/language-provider';
import { Input } from '@/components/ui/input';
import { formatNumber } from '@/lib/format';
import { useDisplayMoney } from '@/components/display-money';
import { currencyTotals, directoryGroups, type DirectoryItem } from '@/lib/account-directory';

/** The person's own order of the accounts within a group (`useDisplayOrder`). */
type Order = { reorder: (moved: string, over: string, ids: string[]) => Promise<void> | void; disabled: boolean };

/** A directory row's second line and marks: its kind or holdings count, its business, and who owns it. */
export type RowDetails = { business: (item: DirectoryItem) => { name: string; mark: ReactNode } | null; owner: (item: DirectoryItem) => ReactNode };

function DirectoryRow({ item, active, details, onSelect }: { item: DirectoryItem; active: boolean; details: RowDetails; onSelect: () => void }) {
 const { t, locale } = useLanguage();
 const { show } = useDisplayMoney();
 const business=details.business(item);
 const kind=item.count!==null?t('{count} holdings',{count:formatNumber(item.count,locale,0)}):t(item.account.kind==='Deposit'?'Deposit':'Cash account');
 return <button type="button" className="account-list-row" aria-pressed={active} onClick={onSelect}><CategoryIcon kind={item.account.kind}/><span className="account-list-name"><span className="account-list-title">{item.account.name}{business?.mark}{details.owner(item)}</span><small>{[kind,business?.name].filter(Boolean).join(' · ')}</small></span><strong>{item.total===null?'—':show(item.total,item.account.currency)}</strong></button>;
}

/** The Accounts directory: a search once there are more than six accounts, then Cash, Deposits and Investments as
 * collapsible groups, each with its total in the display currency and a grid of account cards in the order the person drags them into. */
export function AccountDirectory({ count, visible, activeKey, query, onQuery, onSelect, order, details }: { count: number; visible: DirectoryItem[]; activeKey?: string; query: string; onQuery: (query: string) => void; onSelect: (key: string) => void; order: Order; details: RowDetails }) {
 const { t } = useLanguage();
 const { showSum } = useDisplayMoney();
 return <section className="account-directory" aria-label={t('Accounts')}>
  {count>6&&<label className="account-search"><Search size={18} aria-hidden="true"/><Input aria-label={t('Search accounts')} placeholder={t('Search accounts...')} value={query} onChange={event=>onQuery(event.target.value)}/></label>}
  {directoryGroups.map(([group,label])=>{
   const items=visible.filter(item=>item.group===group), ids=items.map(item=>item.id);
   if(!items.length)return null;
   // Balances in every currency are added in the display currency; a balance that cannot be converted leaves the total out.
   const totals=currencyTotals(items);
   const total=totals.every(item=>item.total!==null)?showSum(totals.map(item=>({amount:item.total!,currency:item.currency}))):null;
   return <details className="panel account-group" key={group} open>
    <summary><ChevronDown size={18} aria-hidden="true"/><h2>{t(label)}</h2><Count value={items.length}/>{total&&<strong>{total}</strong>}</summary>
    <SortableList id={`accounts-${group}`} items={ids} nameOf={id=>items.find(item=>item.id===id)?.account.name??''} onMove={(moved,over)=>void order.reorder(moved,over,ids)} disabled={order.disabled} layout="grid">
     <div className="account-card-grid">{items.map(item=><SortableItem key={item.key} id={item.id} label={item.account.name} className="account-sortable-row"><DirectoryRow item={item} active={activeKey===item.key} details={details} onSelect={()=>onSelect(item.key)}/></SortableItem>)}</div>
    </SortableList>
   </details>;
  })}
  {!visible.length&&<p className="account-search-empty muted">{t('No accounts match your search.')}</p>}
 </section>;
}

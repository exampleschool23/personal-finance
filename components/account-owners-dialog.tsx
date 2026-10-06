"use client";
import { useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import type { OwnerOption } from '@/components/presentation-foundation/owner-filter';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { liabilities, value, type Entry } from '@/lib/finance';
import { showError, showNotice } from '@/lib/feedback';
import { formatMoney, formatNumber } from '@/lib/format';
import { holdingAccountValue, type HoldingAccount } from '@/lib/holding-accounts';
import { holdingOwner, ownerOf, type HouseholdState } from '@/lib/household';
import type { MarketData } from '@/lib/market';

/** "Edit owners": who in the household each account, asset and debt belongs to, or that it is shared.
 * Transactions follow their account and holdings their investment account, so those are listed once, by account. */
export function AccountOwnersDialog({ records, accounts, market, household, owners, onChange, onClose }: { records: Entry[]; accounts: readonly HoldingAccount[]; market: MarketData | null; household: Pick<HouseholdState, 'active' | 'people'>; owners: readonly OwnerOption[]; onChange: (accountId: string, owner: string) => Promise<number>; onClose: () => void }) {
 const { t, locale } = useLanguage();
 const [busy, setBusy] = useState<string | null>(null);
 type Row = { id: string; name: string; kind: Entry['kind']; amount: string; owner: string };
 const recordRow = (record: Entry): Row => ({ id: record.id, name: record.name, kind: record.kind, amount: formatMoney(value(record), record.currency, locale), owner: ownerOf(record, household) });
 const accountRow = (account: HoldingAccount): Row => { const total = holdingAccountValue(account, records, market).total; return { id: account.id, name: account.name, kind: account.kind, amount: total === null ? '—' : formatMoney(total, account.currency, locale), owner: holdingOwner(account, household) }; };
 // Holdings and cash inside an investment account follow it.
 const of = (kinds: readonly string[]) => records.filter(record => !record.holding_account_id && kinds.includes(record.kind)).map(recordRow);
 const groups: Array<[label: string, rows: Row[]]> = [
  ['Cash and deposits', of(['Cash', 'Deposit', 'Treasury bill', 'Bond'])],
  ['Investments', [...accounts.map(accountRow), ...of(['Stock', 'Crypto', 'Precious metals', 'Equity compensation', 'Retirement account'])]],
  ['Property and other assets', of(['Property', 'Business', 'Vehicle', 'Valuables', 'Money lent'])],
  ['Loans and debts', of(liabilities)],
 ];
 async function change(row: Row, owner: string) {
  setBusy(row.id);
  try {
   const moved = await onChange(row.id, owner);
   const name = owners.find(item => item.id === owner)?.name ?? '';
   showNotice(moved ? t('Owner of {name} changed to {owner}, along with {count} records', { name: row.name, owner: name, count: formatNumber(moved, locale, 0) }) : t('Owner of {name} changed to {owner}', { name: row.name, owner: name }));
  } catch (reason) { showError((reason as Error).message || 'Could not save changes.'); }
  finally { setBusy(null); }
 }
 return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
  <DialogContent className="record-dialog account-businesses-dialog">
   <DialogTitle>{t('Edit owners')}</DialogTitle>
   <DialogDescription>{t('Transactions and holdings follow the owner of their account.')}</DialogDescription>
   {groups.map(([label, items]) => items.length > 0 && <section key={label}><h3>{t(label)}</h3><ul>{items.map(row => <li key={row.id}>
    <CategoryIcon kind={row.kind} size="sm"/><span>{row.name}<small>{row.amount}</small></span>
    <NativeSelect aria-label={t('Owner of {name}', { name: row.name })} disabled={busy !== null} value={row.owner} onChange={event => void change(row, event.currentTarget.value)}>
     {owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
    </NativeSelect>
   </li>)}</ul></section>)}
   {groups.every(([, items]) => !items.length) && <p className="muted">{t('Add an account first.')}</p>}
   <div className="record-form-footer"><Button type="button" onClick={onClose} disabled={busy !== null}>{t('Done')}</Button></div>
  </DialogContent>
 </Dialog>;
}

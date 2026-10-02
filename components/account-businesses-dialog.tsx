"use client";
import { useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import type { BusinessOption } from '@/components/presentation-foundation/business-filter';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { businessAccountGroups, isBusinessAccount } from '@/lib/business';
import { value, type Entry } from '@/lib/finance';
import { showError, showNotice } from '@/lib/feedback';
import { formatMoney, formatNumber } from '@/lib/format';

/** "Edit businesses": which business each account, asset and debt belongs to. Transactions in an account follow it. */
export function AccountBusinessesDialog({ records, businesses, onChange, onClose }: { records: readonly Entry[]; businesses: readonly BusinessOption[]; onChange: (accountId: string, business: string | null) => Promise<number>; onClose: () => void }) {
 const { t, locale } = useLanguage();
 const [busy, setBusy] = useState<string | null>(null);
 const accounts = records.filter(isBusinessAccount);
 async function change(record: Entry, business: string | null) {
  setBusy(record.id);
  try {
   const moved = await onChange(record.id, business);
   const name = business ? businesses.find(item => item.id === business)?.name ?? '' : t('Household');
   showNotice(moved ? t('{name} moved to {business} with {count} transactions', { name: record.name, business: name, count: formatNumber(moved, locale, 0) }) : t('{name} moved to {business}', { name: record.name, business: name }));
  } catch (reason) { showError((reason as Error).message || 'Could not save changes.'); }
  finally { setBusy(null); }
 }
 return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
  <DialogContent className="record-dialog account-businesses-dialog">
   <DialogTitle>{t('Edit businesses')}</DialogTitle>
   <DialogDescription>{t('Transactions follow the business of their account.')}</DialogDescription>
   {businessAccountGroups.map(([label, matches]) => {
    const items = accounts.filter(matches);
    return items.length > 0 && <section key={label}><h3>{t(label)}</h3><ul>{items.map(record => <li key={record.id}>
     <CategoryIcon kind={record.kind} size="sm"/><span>{record.name}<small>{formatMoney(value(record), record.currency, locale)}</small></span>
     <NativeSelect aria-label={t('Business for {name}', { name: record.name })} disabled={busy !== null} value={record.business_id ?? ''} onChange={event => void change(record, event.currentTarget.value || null)}>
      <option value="">{t('Household')}</option>
      {businesses.map(business => <option key={business.id} value={business.id}>{business.name}</option>)}
     </NativeSelect>
    </li>)}</ul></section>;
   })}
   {!accounts.length && <p className="muted">{t('Add an account first.')}</p>}
   <div className="record-form-footer"><Button type="button" onClick={onClose} disabled={busy !== null}>{t('Done')}</Button></div>
  </DialogContent>
 </Dialog>;
}

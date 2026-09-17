"use client";
import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useLanguage } from '@/components/language-provider';
import { currencyLabel } from '@/lib/currencies';
import { holdingAccountLabel, type HoldingAccount } from '@/lib/holding-accounts';

export function HoldingAccountDialog({ account, existing, currencies, save, onClose }: { account: HoldingAccount; existing: boolean; currencies: string[]; save: (account: HoldingAccount) => Promise<void>; onClose: () => void }) {
 const { t, locale } = useLanguage();
 const [draft, setDraft] = useState(account), [busy, setBusy] = useState(false), [error, setError] = useState('');
 return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="record-dialog" showCloseButton={!busy}>
  <DialogTitle>{t(existing ? 'Edit account' : 'Add account')}</DialogTitle><DialogDescription>{t('Group your holdings in one account. Its value is calculated from those holdings.')}</DialogDescription>
  <form className="record-form" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { await save(draft); onClose(); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }}>
   <fieldset className="tracker-fields" disabled={busy}>
    <label>{t('Account type')}<Input readOnly value={t(holdingAccountLabel(draft.kind))} /></label>
    <label>{t('Account name')}<Input required maxLength={120} value={draft.name} placeholder={t('e.g. My brokerage or exchange')} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
    <label>{t('Display currency')}<NativeSelect value={draft.currency} onChange={event => setDraft({ ...draft, currency: event.target.value })}>{[...new Set([...currencies, draft.currency])].map(currency => <option key={currency} value={currency}>{currencyLabel(currency, locale)}</option>)}</NativeSelect></label>
   </fieldset>
   {error && <p role="alert" className="error">{t(error)}</p>}
   <div className="record-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('Cancel')}</Button><Button disabled={busy || !draft.name.trim()}>{t(busy ? 'Saving…' : 'Save account')}</Button></div>
  </form>
 </DialogContent></Dialog>;
}

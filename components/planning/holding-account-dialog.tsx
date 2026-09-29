"use client";
import {FormFooter} from '@/components/presentation-foundation/form-footer';
import { CurrencySelect } from '@/components/presentation-foundation/currency-select';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { useDiscardChanges } from '@/components/discard-changes';
import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/components/language-provider';
import { holdingAccountLabel, type HoldingAccount } from '@/lib/holding-accounts';

export function HoldingAccountDialog({ account, existing, currencies, save, onClose }: { account: HoldingAccount; existing: boolean; currencies: string[]; save: (account: HoldingAccount) => Promise<void>; onClose: () => void }) {
 const { t } = useLanguage();
 const [draft, setDraft] = useState(account), [busy, setBusy] = useState(false), [error, setError] = useState('');
 const [initialDraft]=useState(()=>JSON.stringify(draft));
 const guard=useDiscardChanges(JSON.stringify(draft)!==initialDraft,onClose,busy);
 return <><Dialog open onOpenChange={open => { if (!open && !busy) guard.close(); }}><DialogContent className="record-dialog" showCloseButton={!busy}>
  <DialogTitle>{t(existing ? 'Edit account' : 'Add account')}</DialogTitle><DialogDescription>{t('Group your holdings in one account. Its value is calculated from those holdings.')}</DialogDescription>
  <form className="record-form" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { await save(draft); onClose(); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }}>
   <fieldset className="tracker-fields" disabled={busy}>
    <label>{t('Account type')}<Input readOnly value={t(holdingAccountLabel(draft.kind))} /></label>
    <label>{t('Account name')}<Input required maxLength={120} value={draft.name} placeholder={t('e.g. My brokerage or exchange')} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
    <CurrencySelect value={draft.currency} currencies={currencies} savedCurrency={existing?account.currency:undefined} disabled={busy} onChange={currency=>setDraft({...draft,currency})}/>
   </fieldset>
   <ErrorPopup message={error}/>
   <FormFooter busy={busy} onCancel={guard.close}><Button disabled={busy || !draft.name.trim()}>{t(busy ? 'Saving…' : 'Save account')}</Button></FormFooter>
  </form>
 </DialogContent></Dialog>{guard.confirmation}</>;
}

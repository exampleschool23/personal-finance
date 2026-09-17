"use client";
import { NativeSelect } from '@/components/ui/native-select';
import { depositToday } from '@/lib/deposit-interest';
import { useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/date-picker';
import { FormattedNumberInput } from '@/components/formatted-number-input';
import { formatMoney } from '@/lib/format';
import type { Entry } from '@/lib/finance';
export type MortgagePayment = { id: string; mortgage_id: string; principal: number; interest: number; date: string; notes: string; account_id?:string };
export function MortgagePaymentDialog({ mortgage, accounts = [], onClose, onSave }: { accounts?:Entry[]; mortgage: Entry; onClose: () => void; onSave: (payment: MortgagePayment) => Promise<void> }) {
 const { t, locale } = useLanguage();
 const [payment, setPayment] = useState<MortgagePayment>(() => ({ id: crypto.randomUUID(), mortgage_id: mortgage.id, principal: 0, interest: 0, date: depositToday(), notes: '' }));
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [submitted, setSubmitted] = useState(false);
 const money = (amount: number) => formatMoney(amount, mortgage.currency, locale);
 const valid = payment.principal <= mortgage.amount && payment.principal + payment.interest > 0 && !!payment.date;
 return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="record-dialog" showCloseButton={!busy}>
  <DialogTitle>{t('Record mortgage payment')}</DialogTitle>
  <DialogDescription>{mortgage.name} · {t('Outstanding balance: {amount}', { amount: money(mortgage.amount) })}</DialogDescription>
  <form className="record-form" onSubmit={async event => {
   event.preventDefault(); if (!valid || busy) return;
   setBusy(true); setSubmitted(true); setError('');
   try { await onSave(payment); onClose(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }}>
   <p className="muted">{t('Enter principal and interest from your bank statement. Only principal reduces your mortgage.')}</p>
   <fieldset disabled={busy || submitted} className="grid gap-5 border-0 p-0 m-0 min-w-0">
    <div className="form-grid"><label>{t('Principal repayment')}<FormattedNumberInput value={payment.principal} required={false} max={mortgage.amount} onValueChange={principal => setPayment({ ...payment, principal })}/></label>
    <label>{t('Interest paid')}<FormattedNumberInput value={payment.interest} required={false} onValueChange={interest => setPayment({ ...payment, interest })}/></label></div>
    <label>{t('Cash account')}<NativeSelect value={payment.account_id??''} onChange={e=>setPayment({...payment,account_id:e.target.value||undefined})}><option value="">{t('No account balance change')}</option>{accounts.filter(a=>a.kind==='Cash'&&a.currency===mortgage.currency).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</NativeSelect></label><label>{t('Payment date')}<DatePicker value={payment.date} onChange={date => setPayment({ ...payment, date })}/></label>
    <label>{t('Notes (optional)')}<textarea rows={2} maxLength={2000} value={payment.notes} onChange={e => setPayment({ ...payment, notes: e.target.value })}/></label>
   </fieldset>
   <div className="ownership-summary"><p>{t('Total payment: {amount}', { amount: money(payment.principal + payment.interest) })}</p><p>{t('Remaining balance: {amount}', { amount: money(mortgage.amount - payment.principal) })}</p></div>
   <p className="muted">{t('Saved once in Income & expenses. The selected cash account pays the total. Saved payments cannot be edited or deleted.')}</p>
   {error && <p className="error" role="alert">{t(error)} {t('Retry the same payment to avoid duplicates.')}</p>}
   <div className="record-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('Cancel')}</Button><Button disabled={busy || !valid} type="submit">{t(busy ? 'Saving…' : 'Record payment')}</Button></div>
  </form>
 </DialogContent></Dialog>;
}

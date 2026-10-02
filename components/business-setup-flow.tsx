"use client";
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { BusinessProfileFields } from '@/components/business-profile-fields';
import { BusinessMark } from '@/components/presentation-foundation/business-mark';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { isBusinessAccount, nextPaletteColor } from '@/lib/business';
import { value, type Entry } from '@/lib/finance';
import { showSaved } from '@/lib/feedback';
import { formatMoney } from '@/lib/format';

const steps = ['start', 'businesses', 'accounts', 'done'] as const;
const stepLabels = { start: 'Start', businesses: 'Businesses', accounts: 'Accounts', done: 'Done' } as const;

type Props = { businesses: readonly Entry[]; records: readonly Entry[]; newBusiness: (name?: string) => Entry; saveBusiness: (business: Entry) => Promise<void>; setAccountBusiness: (accountId: string, business: string | null) => Promise<number>; onClose: () => void };

/** Business tracking setup: whether a business was tracked by hand before, the businesses themselves
 * (name, legal structure, colour, logo, notes), which accounts belong to each, and guidance for what comes next. */
export function BusinessSetupFlow({ businesses, records, newBusiness, saveBusiness, setAccountBusiness, onClose }: Props) {
 const { t, locale } = useLanguage();
 const [step, setStep] = useState(0), [trackedBefore, setTrackedBefore] = useState<boolean | null>(null);
 const [drafts, setDrafts] = useState<Entry[]>(() => businesses.length ? businesses.map(item => ({ ...item })) : [{ ...newBusiness(), business_color: nextPaletteColor([]) }]);
 const [assignments, setAssignments] = useState<Record<string, string | null>>(() => Object.fromEntries(records.filter(isBusinessAccount).map(record => [record.id, record.business_id ?? null])));
 const [busy, setBusy] = useState(false), [error, setError] = useState('');
 const name = steps[step];
 const named = drafts.filter(draft => draft.name.trim());
 const accounts = records.filter(isBusinessAccount);
 const ready = name === 'start' ? trackedBefore !== null : name === 'businesses' ? named.length > 0 : true;
 const update = (id: string, patch: Partial<Entry>) => setDrafts(list => list.map(draft => draft.id === id ? { ...draft, ...patch } : draft));

 async function next() {
  if (!ready || busy) return;
  setError('');
  if (name === 'businesses') {
   setBusy(true);
   // Saved one by one under fixed ids, so a retry never creates a business twice.
   try {
    for (const draft of named) {
     const saved = businesses.find(item => item.id === draft.id);
     if (!saved || JSON.stringify(saved) !== JSON.stringify(draft)) await saveBusiness({ ...draft, name: draft.name.trim() });
    }
    setDrafts(named); setStep(step + 1);
   } catch (reason) { setError(t((reason as Error).message || 'Could not save changes.')); }
   finally { setBusy(false); }
   return;
  }
  if (name === 'accounts') {
   setBusy(true);
   try {
    for (const account of accounts) if ((account.business_id ?? null) !== (assignments[account.id] ?? null)) await setAccountBusiness(account.id, assignments[account.id] ?? null);
    showSaved(); setStep(step + 1);
   } catch (reason) { setError(t((reason as Error).message || 'Could not save changes.')); }
   finally { setBusy(false); }
   return;
  }
  if (name === 'done') { onClose(); return; }
  setStep(step + 1);
 }

 const guidance = trackedBefore ? [
  ['🏷️', 'Keep your categories', 'Any category works for business transactions. Nothing needs recategorizing.'],
  ['🔖', 'Move tagged history', 'In Settings, open Tags and click a tag’s transaction count, then select them and set their business.'],
  ['⚙️', 'Update your rules', 'Rules that tagged a business can now set the business itself.'],
 ] : [
  ['🧾', 'Assign personal-account spending', 'On Transactions, set the business of anything paid from a personal account.'],
  ['⚙️', 'Create rules', 'A rule can send every purchase from a merchant to a business automatically.'],
  ['📊', 'Watch each business', 'Reports show each business’s profit and loss; tax prep is ready when you need it.'],
 ];

 return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
  <DialogContent className="goal-setup business-setup top-0 left-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none" showCloseButton={false}>
   <header className="goal-setup-bar">
    {step && name !== 'done' ? <Button variant="ghost" size="icon" disabled={busy} aria-label={t('Back')} onClick={() => setStep(step - 1)}><ArrowLeft size={18} aria-hidden="true"/></Button> : <span className="goal-setup-spacer"/>}
    <DialogTitle className="sr-only">{t('Set up business tracking')}</DialogTitle><DialogDescription className="sr-only">{t(stepLabels[name])}</DialogDescription>
    <ol className="goal-setup-steps">{steps.map((each, index) => <li key={each} aria-current={index === step ? 'step' : undefined}><span>{t(stepLabels[each])}</span></li>)}</ol>
    <Button variant="ghost" size="icon" disabled={busy} aria-label={t('Close')} onClick={onClose}><X size={18} aria-hidden="true"/></Button>
   </header>
   <div className="goal-setup-progress" aria-hidden="true"><span style={{ width: `${(step + 1) / steps.length * 100}%` }}/></div>
   <div className="goal-setup-body">
    {name === 'start' && <section className="goal-setup-single">
     <h1>{t('Have you tracked a business here before?')}</h1>
     <ul className="goal-template-grid business-setup-choices">{([[true, '🗂️', 'Yes, I track one by hand', 'With category groups or tags'], [false, '✨', 'No, I’m starting fresh', 'Set up a business from scratch']] as const).map(([choice, emoji, title, detail]) => <li key={String(choice)} className="goal-template" data-selected={trackedBefore === choice || undefined}>
      <button type="button" className="goal-template-pick" aria-pressed={trackedBefore === choice} onClick={() => setTrackedBefore(choice)}><span className="goal-row-cover" aria-hidden="true">{emoji}</span><span><strong>{t(title)}</strong><small>{t(detail)}</small></span></button>
     </li>)}</ul>
     <p className="goal-setup-note">{t('Business tracking suits income that flows through your personal taxes: sole proprietorships, single-member LLCs and rental properties.')}</p>
    </section>}

    {name === 'businesses' && <section className="goal-setup-single">
     <h1>{t('Add your businesses')}</h1>
     {drafts.map(draft => <article key={draft.id} className="panel goal-setup-card">
      <header><BusinessMark name={draft.name || '?'} color={draft.business_color} logo={draft.business_logo}/><label className="goal-setup-name">{t('Name')}<Input required maxLength={120} value={draft.name} placeholder={t('e.g. Coastal Candle Company')} onChange={event => update(draft.id, { name: event.target.value })}/></label>
       {drafts.length > 1 && !businesses.some(item => item.id === draft.id) && <Button variant="ghost" size="icon" aria-label={t('Remove {name}', { name: draft.name || t('Business') })} onClick={() => setDrafts(list => list.filter(item => item.id !== draft.id))}><Trash2 size={16} aria-hidden="true"/></Button>}</header>
      <BusinessProfileFields value={draft} disabled={busy} onChange={patch => update(draft.id, patch)}/>
      <label className="business-setup-notes">{t('Notes (optional)')}<textarea rows={2} maxLength={2000} value={draft.notes} onChange={event => update(draft.id, { notes: event.target.value })}/></label>
     </article>)}
     <Button variant="outline" disabled={busy} onClick={() => setDrafts(list => [...list, { ...newBusiness(), business_color: nextPaletteColor(list.map(item => item.business_color)) }])}><Plus size={16} aria-hidden="true"/>{t('Add another business')}</Button>
    </section>}

    {name === 'accounts' && <section className="goal-setup-single">
     <h1>{t('Which accounts belong to a business?')}</h1>
     {accounts.length ? <ul className="business-setup-accounts">{accounts.map(account => <li key={account.id}>
      <CategoryIcon kind={account.kind} size="sm"/><span>{account.name}<small>{t(account.kind)} · {formatMoney(value(account), account.currency, locale)}</small></span>
      <NativeSelect aria-label={t('Business for {name}', { name: account.name })} value={assignments[account.id] ?? ''} onChange={event => setAssignments(current => ({ ...current, [account.id]: event.currentTarget.value || null }))}>
       <option value="">{t('Household')}</option>
       {named.map(business => <option key={business.id} value={business.id}>{business.name}</option>)}
      </NativeSelect>
     </li>)}</ul> : <p className="goal-setup-note">{t('No accounts yet.')}</p>}
     <p className="goal-setup-note">{t('No business bank account? Skip this step and assign transactions or create rules later.')}</p>
    </section>}

    {name === 'done' && <section className="goal-setup-single">
     <h1>{t('Business tracking is on')}</h1>
     <ul className="business-setup-guidance">{guidance.map(([emoji, title, detail]) => <li key={title} className="panel"><span className="goal-row-cover" aria-hidden="true">{emoji}</span><span><strong>{t(title)}</strong><small>{t(detail)}</small></span></li>)}</ul>
     <div className="business-setup-links"><DrawerLink className="panel-link" href="/transactions" onClick={onClose}>{t('Go to transactions')}</DrawerLink><DrawerLink className="panel-link" href="/reports" onClick={onClose}>{t('View reports')}</DrawerLink></div>
    </section>}
   </div>
   <footer className="goal-setup-footer">
    {name === 'accounts' && <Button variant="outline" disabled={busy} onClick={() => setStep(step + 1)}>{t('Skip')}</Button>}
    <Button disabled={!ready || busy} onClick={() => void next()}>{t(busy ? 'Saving…' : name === 'done' ? 'Finish' : 'Next')}</Button>
   </footer>
   <ErrorPopup message={error}/>
  </DialogContent>
 </Dialog>;
}

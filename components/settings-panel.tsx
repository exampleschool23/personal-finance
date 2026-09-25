"use client";
import { showSaved } from '@/lib/save-feedback';
import { useUnsavedNavigation } from '@/components/discard-changes';
import { LoadingPlaceholder } from '@/components/loading-placeholder';
import { useState } from 'react';

import { countryOptions } from '@/lib/countries';
import { Globe2, Search } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { currencyLabel, fiatCurrencies, type Preferences } from '@/lib/currencies';
export function SettingsPanel({ initial, demo, onSaved, loading, loadError, onRetry }: { initial: Preferences; demo: boolean; onSaved: (p: Preferences) => void; loading: boolean; loadError: string; onRetry:()=>void }) {
  const { t, locale } = useLanguage();
  const [draft, setDraft] = useState(initial);
  const [saved,setSaved]=useState(initial);
  const confirmation=useUnsavedNavigation(!loading&&!loadError&&JSON.stringify(draft)!==JSON.stringify(saved));
  const [query, setQuery] = useState('');
  const [currencySearchOpen, setCurrencySearchOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const currencies = fiatCurrencies.filter(c => currencyLabel(c.code, locale).toLowerCase().includes(query.trim().toLowerCase()));
  async function save() {
    setBusy(true); setMessage('');
    try {
      let next = { ...draft, display_name: (draft.display_name ?? '').trim() };
      if (!demo) { const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) }); if (!response.ok) { const data = await response.json() as { error: string }; throw Error(data.error); } next = await response.json() as typeof next; }
      onSaved(next); setDraft(next); setSaved(next); showSaved(next.language);
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="settings-page">{loadError && <p className="error" role="alert">{t(loadError)} <Button type="button" variant="outline" onClick={onRetry}>{t('Retry loading settings')}</Button></p>}{loading ? <LoadingPlaceholder label={t('Loading settings…')}/> : <div className="settings-columns"><form onSubmit={event => { event.preventDefault(); void save(); }} className="panel settings-form"><div className="profile-settings"><div className="profile-settings-header"><h2>{t('About you')}</h2><Button type="submit" disabled={busy || !!loadError}>{t(busy ? 'Saving…' : 'Save settings')}</Button></div><label htmlFor="profile-name">{t('Your name (optional)')}</label><Input id="profile-name" name="name" autoComplete="given-name" maxLength={80} placeholder={t('What should we call you?')} value={draft.display_name ?? ''} onChange={event => setDraft({ ...draft, display_name: event.target.value })}/><label htmlFor="profile-country">{t('Country / region (optional)')}</label><NativeSelect id="profile-country" name="country" autoComplete="country" value={draft.country ?? ''} onChange={event => setDraft({ ...draft, country: event.target.value })}><option value="">{t('Select your country')}</option>{countryOptions(locale).map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</NativeSelect></div><div className="settings-section-heading"><span><Globe2 size={22}/></span><div><h2>{t('Language & currencies')}</h2></div></div><label>{t('Default language')}<NativeSelect value={draft.language} onChange={event => setDraft({ ...draft, language: event.target.value as Preferences['language'] })}><option value="en">English</option><option value="ru">Русский</option><option value="uz">O‘zbekcha</option></NativeSelect></label><h2>{t('Preferred currencies')}</h2><label>{t('Primary currency')}<NativeSelect value={draft.currencies[0]} onChange={event => setDraft({ ...draft, currencies: [event.target.value, ...draft.currencies.filter(c => c !== event.target.value)] })}>{draft.currencies.map(code => <option key={code} value={code}>{currencyLabel(code, locale)}</option>)}</NativeSelect></label><div className="selected-currencies">{draft.currencies.map(code => <button key={code} type="button" disabled={draft.currencies.length === 1} onClick={() => setDraft({ ...draft, currencies: draft.currencies.filter(c => c !== code) })} aria-label={t('Remove {currency}', { currency: code })}>{code} ×</button>)}</div><Dialog open={currencySearchOpen} onOpenChange={open=>{setCurrencySearchOpen(open);if(!open)setQuery('');}}><DialogTrigger asChild><Button type="button" variant="outline" className="currency-search-trigger"><Search size={18} aria-hidden="true"/>{t('Search currencies')}</Button></DialogTrigger><DialogContent className="currency-search-dialog sm:max-w-xl" showCloseButton={false}><DialogHeader><DialogTitle>{t('Preferred currencies')}</DialogTitle><DialogDescription>{t('Choose as many as you need. The primary currency opens by default.')}</DialogDescription></DialogHeader><Input aria-label={t('Search currencies')} placeholder={t('Search currencies')} value={query} onChange={e=>setQuery(e.target.value)}/><div className="currency-catalogue">{currencies.map(c => <label key={c.code}><input type="checkbox" checked={draft.currencies.includes(c.code)} disabled={draft.currencies.length === 1 && draft.currencies.includes(c.code)} onChange={e => setDraft({ ...draft, currencies: e.target.checked ? [...draft.currencies, c.code] : draft.currencies.filter(code => code !== c.code) })}/><span>{currencyLabel(c.code, locale)}</span></label>)}{!currencies.length&&<p className="muted currency-search-empty" role="status">{t('No matching currencies.')}</p>}</div><div className="currency-search-footer"><DialogClose asChild><Button type="button">{t('Done')}</Button></DialogClose></div></DialogContent></Dialog>{message && <p className="error" role="alert">{t(message)}</p>}</form></div>}{confirmation}</section>;
}

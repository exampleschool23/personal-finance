"use client";
import { useUnsavedNavigation } from '@/components/discard-changes';
import { InvestmentComparisonSettings } from '@/components/investment-comparison-settings';
import { LoadingPlaceholder } from '@/components/loading-placeholder';
import { useState } from 'react';
import { Globe2, SlidersHorizontal } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { currencyLabel, fiatCurrencies, type Preferences } from '@/lib/currencies';
export function SettingsPanel({ initial, demo, onSaved, loading, loadError, onRetry }: { initial: Preferences; demo: boolean; onSaved: (p: Preferences) => void; loading: boolean; loadError: string; onRetry:()=>void }) {
  const { t, locale } = useLanguage();
  const [draft, setDraft] = useState(initial);
  const [saved,setSaved]=useState(initial);
  const confirmation=useUnsavedNavigation(!loading&&!loadError&&JSON.stringify(draft)!==JSON.stringify(saved));
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const currencies = fiatCurrencies.filter(c => currencyLabel(c.code, locale).toLowerCase().includes(query.trim().toLowerCase()));
  async function save() {
    setBusy(true); setMessage(''); setFailed(false);
    try {
      if (!demo) { const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) }); if (!response.ok) { const data = await response.json() as { error: string }; throw Error(data.error); } }
      onSaved(draft); setSaved(draft); setMessage(demo ? 'Saved for this demo session.' : 'Settings saved.');
    } catch (error) { setFailed(true); setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="settings-page"><div className="page-heading"><div><p className="eyebrow">{t('My workspace')}</p><h1>{t('Settings')}</h1><p className="muted">{t('Choose your default language and the currencies you use.')}</p></div></div>{loadError && <p className="error" role="alert">{t(loadError)} <Button type="button" variant="outline" onClick={onRetry}>{t('Retry loading settings')}</Button></p>}{loading ? <LoadingPlaceholder label={t('Loading settings…')}/> : <div className="settings-columns"><form onSubmit={event => { event.preventDefault(); void save(); }} className="panel settings-form"><div className="settings-section-heading"><span><Globe2 size={22}/></span><div><h2>{t('Language & currencies')}</h2><p>{t('Make this workspace yours.')}</p></div></div><label>{t('Default language')}<select value={draft.language} onChange={event => setDraft({ ...draft, language: event.target.value as Preferences['language'] })}><option value="en">English</option><option value="ru">Русский</option><option value="uz">O‘zbekcha</option></select></label><p className="muted">{t('Used when you open the app. The top-right switcher changes language for the current visit.')}</p><h2>{t('Preferred currencies')}</h2><p className="muted">{t('Choose as many as you need. The primary currency opens by default.')}</p><label>{t('Primary currency')}<select value={draft.currencies[0]} onChange={event => setDraft({ ...draft, currencies: [event.target.value, ...draft.currencies.filter(c => c !== event.target.value)] })}>{draft.currencies.map(code => <option key={code} value={code}>{currencyLabel(code, locale)}</option>)}</select></label><div className="selected-currencies">{draft.currencies.map(code => <button key={code} type="button" disabled={draft.currencies.length === 1} onClick={() => setDraft({ ...draft, currencies: draft.currencies.filter(c => c !== code) })} aria-label={t('Remove {currency}', { currency: code })}>{code} ×</button>)}</div><Input aria-label={t('Search currencies')} placeholder={t('Search currencies')} value={query} onChange={e => setQuery(e.target.value)}/><div className="currency-catalogue">{currencies.map(c => <label key={c.code}><input type="checkbox" checked={draft.currencies.includes(c.code)} disabled={draft.currencies.length === 1 && draft.currencies.includes(c.code)} onChange={e => setDraft({ ...draft, currencies: e.target.checked ? [...draft.currencies, c.code] : draft.currencies.filter(code => code !== c.code) })}/><span>{currencyLabel(c.code, locale)}</span></label>)}</div><p className="muted">{t('Currencies without an available exchange rate keep their original amounts and are excluded from converted totals.')}</p>{message && <p className={failed ? 'error' : 'muted'} role="status">{t(message)}</p>}<Button className="primary" disabled={busy || !!loadError}>{t(busy ? 'Saving…' : 'Save settings')}</Button></form><aside className="settings-benchmarks"><div className="settings-section-heading"><span><SlidersHorizontal size={22}/></span><div><h2>{t('Investment benchmarks')}</h2><p>{t('Choose how you measure progress.')}</p></div></div><InvestmentComparisonSettings demo={demo}/></aside></div>}{confirmation}</section>;
}

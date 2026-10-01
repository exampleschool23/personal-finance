"use client";
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { countryOptions } from '@/lib/countries';
import { currencyLabel, fiatCurrencies, type Preferences } from '@/lib/currencies';
import { depositToday } from '@/lib/deposit-interest';
import { formatDate, formatMoney } from '@/lib/format';
import { isLanguage, languageCatalogue } from '@/lib/i18n';
import { countryCurrency, currenciesForCountry, goalHorizons, goalTargetDate, horizonDate, makePrimary, onboardingGoalPayload, onboardingSteps, pickCurrency, startingCurrencies, suggestedCurrencies, trackingStartFor, type OnboardingGoal, type TrackingPreset } from '@/lib/onboarding';
import styles from './onboarding-screen.module.css';

type Props = {
  brand: ReactNode;
  initial: Preferences;
  /** The Telegram connect panel, supplied by the shell so this screen stays free of network code. */
  telegram: ReactNode;
  savePreferences: (preferences: Preferences) => Promise<Preferences>;
  applyPreferences: (preferences: Preferences) => void;
  saveGoal: (goal: NonNullable<ReturnType<typeof onboardingGoalPayload>>) => Promise<unknown>;
  saveTrackingStart: (date: string) => Promise<void>;
  today?: string;
};

/** The welcome setup: four short questions after the first sign-in, saved together at the end. */
export function OnboardingScreen({ brand, initial, telegram, savePreferences, applyPreferences, saveGoal, saveTrackingStart, today = depositToday() }: Props) {
  const { t, locale, setLanguage } = useLanguage();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Preferences>({ ...initial, currencies: startingCurrencies(initial.currencies), display_name: initial.display_name ?? '' });
  const [goal, setGoal] = useState<OnboardingGoal>({ target: 0, horizon: null, custom: '' });
  const [tracking, setTracking] = useState<{ preset: TrackingPreset; custom: string }>({ preset: 'later', custom: '' });
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Preferences | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step, saved]);
  const current = onboardingSteps[step];
  const last = step === onboardingSteps.length - 1;
  const primary = draft.currencies[0];
  const name = (draft.display_name ?? '').trim();
  const targetDate = goalTargetDate(goal, today);
  const catalogue = query.trim() ? fiatCurrencies.filter(item => currencyLabel(item.code, locale).toLowerCase().includes(query.trim().toLowerCase())).slice(0, 12) : [];
  const cards = [...new Set([...draft.currencies, countryCurrency(draft.country ?? '') ?? [], ...suggestedCurrencies].flat())];

  async function finish(skipAll = false) {
    setBusy(true); setError('');
    try {
      const preferences = { ...draft, display_name: name };
      if (!skipAll) {
        const payload = onboardingGoalPayload(goal, primary, t('Net worth target'), today);
        if (payload) await saveGoal(payload);
        const start = trackingStartFor(tracking.preset, today, tracking.custom);
        if (start) await saveTrackingStart(start);
      }
      const result = await savePreferences({ ...preferences, onboarded: true });
      if (skipAll) applyPreferences(result); else setSaved(result);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  const next = () => { setError(''); if (last) void finish(); else setStep(step + 1); };

  if (saved) return <main className={styles.page}>
    <header className={styles.header}>{brand}</header>
    <section className={`${styles.step} ${styles.done}`} aria-live="polite">
      <span className={styles.doneMark}><Check size={34} strokeWidth={3} aria-hidden="true"/></span>
      <h1 ref={heading} tabIndex={-1}>{name ? t('You’re all set, {name}.', { name }) : t('You’re all set.')}</h1>
      <p>{t('Your workspace is ready. Everything here can be changed later in Settings.')}</p>
      <Button type="button" className={styles.primaryAction} onClick={() => applyPreferences(saved)}>{t('Open my workspace')}<ArrowRight size={18}/></Button>
    </section>
  </main>;

  return <main className={styles.page}>
    <header className={styles.header}>{brand}<Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void finish(true)}>{t('Skip setup')}</Button></header>
    <div className={styles.progress} role="progressbar" aria-valuemin={1} aria-valuemax={onboardingSteps.length} aria-valuenow={step + 1} aria-label={t('Setup progress')}><span style={{ width: `${((step + 1) / onboardingSteps.length) * 100}%` }}/></div>
    <p className={styles.stepLabel}>{t('Step {current} of {total}', { current: step + 1, total: onboardingSteps.length })}</p>
    <section key={current} className={styles.step} data-step={current}>
      {current === 'profile' && <>
        <p className={styles.eyebrow}><Sparkles size={14} aria-hidden="true"/>{t('WELCOME')}</p>
        <h1 ref={heading} tabIndex={-1}>{t('Let’s set up your workspace.')}</h1>
        <p className={styles.lead}>{t('A few quick questions. Everything can be changed later in Settings.')}</p>
        <label className={styles.field} htmlFor="onboarding-name">{t('What should we call you?')}<Input id="onboarding-name" autoFocus maxLength={80} autoComplete="given-name" placeholder={t('Your name (optional)')} value={draft.display_name ?? ''} onChange={event => setDraft({ ...draft, display_name: event.target.value })}/></label>
        <label className={styles.field} htmlFor="onboarding-country">{t('Country / region (optional)')}<NativeSelect id="onboarding-country" autoComplete="country" value={draft.country ?? ''} onChange={event => setDraft({ ...draft, country: event.target.value, currencies: currenciesForCountry(draft.currencies, event.target.value) })}><option value="">{t('Select your country')}</option>{countryOptions(locale).map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</NativeSelect></label>
        <label className={styles.field} htmlFor="onboarding-language">{t('App language')}<NativeSelect id="onboarding-language" value={draft.language} onChange={event => { const code = event.target.value; if (isLanguage(code)) { setLanguage(code); setDraft({ ...draft, language: code }); } }}>{languageCatalogue.map(({ code, native }) => <option key={code} value={code} lang={code}>{native}</option>)}</NativeSelect></label>
      </>}
      {current === 'currencies' && <>
        <h1 ref={heading} tabIndex={-1}>{t('Which currencies do you use?')}</h1>
        <p className={styles.lead}>{t('Choose one or two. The first one becomes your primary currency.')}</p>
        <div className={styles.options} role="group" aria-label={t('Preferred currencies')}>
          {cards.map(code => <button key={code} type="button" className={styles.option} aria-pressed={draft.currencies.includes(code)} onClick={() => setDraft({ ...draft, currencies: pickCurrency(draft.currencies, code) })}><span className={styles.optionMark}><Check size={14} strokeWidth={3} aria-hidden="true"/></span><strong>{code}</strong><span>{currencyLabel(code, locale).split(' · ').slice(1).join(' · ')}</span>{code === primary && <em className={styles.primaryBadge}>{t('Primary')}</em>}</button>)}
        </div>
        <label className={styles.field} htmlFor="onboarding-currency-search">{t('Need another currency?')}<Input id="onboarding-currency-search" placeholder={t('Search currencies')} value={query} onChange={event => setQuery(event.target.value)}/></label>
        {!!query.trim() && <div className={styles.chips}>{catalogue.map(item => <button key={item.code} type="button" className={styles.chip} aria-pressed={draft.currencies.includes(item.code)} onClick={() => { setDraft({ ...draft, currencies: pickCurrency(draft.currencies, item.code) }); setQuery(''); }}>{currencyLabel(item.code, locale)}</button>)}{!catalogue.length && <p className="muted" role="status">{t('No matching currencies.')}</p>}</div>}
        {draft.currencies.length > 1 && <p className={styles.hint}>{t('{primary} is primary.', { primary })} <button type="button" className={styles.linkButton} onClick={() => setDraft({ ...draft, currencies: makePrimary(draft.currencies, draft.currencies[1]) })}>{t('Make {code} primary', { code: draft.currencies[1] })}</button></p>}
      </>}
      {current === 'goal' && <>
        <h1 ref={heading} tabIndex={-1}>{t('Set a first target.')}</h1>
        <p className={styles.lead}>{t('A net worth to aim for. Skip this if you would rather start with your records.')}</p>
        <label className={styles.field} htmlFor="onboarding-target">{t('Target amount')}<span className={styles.amount}><FormattedNumberInput value={goal.target} required={false} onValueChange={value => setGoal({ ...goal, target: value })}/><span>{primary}</span></span></label>
        <p className={styles.groupLabel} id="onboarding-horizon">{t('When do you want to reach it?')}</p>
        <div className={styles.options} role="group" aria-labelledby="onboarding-horizon">
          {goalHorizons.map(years => <button key={years} type="button" className={styles.option} aria-pressed={goal.horizon === years} onClick={() => setGoal({ ...goal, horizon: goal.horizon === years ? null : years })}><span className={styles.optionMark}><Check size={14} strokeWidth={3} aria-hidden="true"/></span><strong>{t(years === 1 ? 'In 1 year' : 'In {years} years', { years })}</strong><span>{formatDate(horizonDate(today, years), locale)}</span></button>)}
          <button type="button" className={styles.option} aria-pressed={goal.horizon === 'custom'} onClick={() => setGoal({ ...goal, horizon: goal.horizon === 'custom' ? null : 'custom' })}><span className={styles.optionMark}><Check size={14} strokeWidth={3} aria-hidden="true"/></span><strong>{t('Choose a date')}</strong><span>{goal.horizon === 'custom' && goal.custom ? formatDate(goal.custom, locale) : t('Any day after today')}</span></button>
        </div>
        {goal.horizon === 'custom' && <div className={styles.picker}><DatePicker value={goal.custom} min={today} onChange={custom => setGoal({ ...goal, custom })}/></div>}
        {goal.target > 0 && targetDate && <p className={styles.hint}>{t('Reach {amount} by {date}.', { amount: formatMoney(goal.target, primary, locale), date: formatDate(targetDate, locale) })}</p>}
      </>}
      {current === 'connect' && <>
        <h1 ref={heading} tabIndex={-1}>{t('Stay in the loop.')}</h1>
        <p className={styles.lead}>{t('Optional. Connect Telegram for reminders, and choose the day your portfolio chart starts.')}</p>
        <div className={styles.telegram}>{telegram}</div>
        <p className={styles.groupLabel} id="onboarding-tracking">{t('Start tracking from')}</p>
        <div className={styles.options} role="group" aria-labelledby="onboarding-tracking">
          {([['today', t('Today'), formatDate(today, locale)], ['year', t('Start of this year'), formatDate(today.slice(0, 4) + '-01-01', locale)], ['custom', t('Choose a date'), tracking.preset === 'custom' && tracking.custom ? formatDate(tracking.custom, locale) : t('Any earlier day')], ['later', t('Decide later'), t('From your first investment')]] as const).map(([preset, label, detail]) => <button key={preset} type="button" className={styles.option} aria-pressed={tracking.preset === preset} onClick={() => setTracking({ ...tracking, preset })}><span className={styles.optionMark}><Check size={14} strokeWidth={3} aria-hidden="true"/></span><strong>{label}</strong><span>{detail}</span></button>)}
        </div>
        {tracking.preset === 'custom' && <div className={styles.picker}><DatePicker value={tracking.custom} min="2016-01-01" max={today} onChange={custom => setTracking({ ...tracking, custom })}/></div>}
      </>}
    </section>
    {error && <p className={styles.error} role="alert">{t(error)}</p>}
    <footer className={styles.actions}>
      <Button type="button" variant="ghost" disabled={busy || step === 0} onClick={() => { setError(''); setStep(step - 1); }}><ArrowLeft size={16}/>{t('Back')}</Button>
      <div className={styles.actionsRight}>
        {!last && step > 0 && <Button type="button" variant="ghost" disabled={busy} onClick={() => { setError(''); setStep(step + 1); }}>{t('Skip this step')}</Button>}
        <Button type="button" className={styles.primaryAction} disabled={busy} onClick={next}>{t(busy ? 'Saving…' : last ? 'Finish setup' : 'Continue')}<ArrowRight size={18}/></Button>
      </div>
    </footer>
  </main>;
}

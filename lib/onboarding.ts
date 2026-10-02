import { calendarIso } from './format';
import { depositToday } from './deposit-interest';
import { replacePreferredCurrency, togglePreferredCurrency, type Preferences } from './currencies';

/** The welcome setup shown once after the first sign-in, one question per step. */
export const onboardingSteps = ['profile', 'currencies', 'goal', 'connect'] as const;
export type OnboardingStep = (typeof onboardingSteps)[number];
/** Offered first on the currency step; the full fiat catalogue stays behind the search. */
export const suggestedCurrencies = ['USD', 'EUR', 'GBP', 'RUB', 'TRY', 'AED'];
/** The currencies every account started with before the welcome setup. Untouched, they are not a choice the owner made. */
export const legacyDefaultCurrencies = ['USD', 'UZS'];
export const startingCurrencies = (saved: string[]) => saved.length === legacyDefaultCurrencies.length && saved.every((code, index) => code === legacyDefaultCurrencies[index]) ? ['USD'] : saved;
export const goalHorizons = [1, 3, 5] as const;
export type TrackingPreset = 'today' | 'year' | 'custom' | 'later';

/** A signed-in owner whose settings are still loading. The workspace waits, so the welcome setup never appears after the dashboard has already been shown. */
export const awaitingSettings = (state: { user: string | null; demo: boolean; loading: boolean }) => !!state.user && !state.demo && state.loading;

/** A signed-in owner whose loaded preferences never recorded a finished setup. Sample workspaces, loading and failed loads never open it. */
export function needsOnboarding(state: { user: string | null; demo: boolean; loading: boolean; error: string; preferences: Pick<Preferences, 'onboarded'> }) {
  return !!state.user && !state.demo && !state.loading && !state.error && state.preferences.onboarded === false;
}

/** The day the welcome setup was finished, on the app's Asia/Tashkent calendar. */
export const onboardedOn = (finishedAt: unknown) => typeof finishedAt === 'string' && finishedAt && Number.isFinite(Date.parse(finishedAt)) ? depositToday(new Date(finishedAt)) : undefined;
/** The dashboard greets a brand-new account ("Welcome") on the day it finished the welcome setup, and says "Welcome back" afterwards. */
export const firstVisit = (preferences: Pick<Preferences, 'onboarded_on'>, today: string) => !!preferences.onboarded_on && preferences.onboarded_on === today;

/** A tap on a currency card: toggle it, or when two are already chosen replace the secondary one so the primary stays. */
export function pickCurrency(list: string[], code: string) {
  const result = togglePreferredCurrency(list, code);
  if ('currencies' in result) return result.currencies;
  return result.blocked === 'last' ? list : replacePreferredCurrency(list, list[list.length - 1], code);
}
export const makePrimary = (list: string[], code: string) => list.includes(code) ? [code, ...list.filter(item => item !== code)] : list;

/** Home currency of the countries owners most often choose; others keep the current list. */
const countryCurrencies: Record<string, string> = { UZ: 'UZS', US: 'USD', RU: 'RUB', KZ: 'KZT', KG: 'KGS', TJ: 'TJS', TM: 'TMT', AZ: 'AZN', GE: 'GEL', AM: 'AMD', BY: 'BYN', UA: 'UAH', TR: 'TRY', AE: 'AED', SA: 'SAR', QA: 'QAR', GB: 'GBP', CH: 'CHF', PL: 'PLN', CZ: 'CZK', SE: 'SEK', NO: 'NOK', DK: 'DKK', CN: 'CNY', JP: 'JPY', KR: 'KRW', IN: 'INR', PK: 'PKR', ID: 'IDR', MY: 'MYR', SG: 'SGD', TH: 'THB', VN: 'VND', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', AU: 'AUD', NZ: 'NZD', ZA: 'ZAR', EG: 'EGP', IL: 'ILS', ...Object.fromEntries(['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'].map(code => [code, 'EUR'])) };
export const countryCurrency = (country: string) => countryCurrencies[country] ?? null;
/** Choosing a country makes its currency primary; the previous primary stays as the second choice. */
export function currenciesForCountry(list: string[], country: string) {
  const code = countryCurrency(country);
  return code ? [code, ...list.filter(item => item !== code)].slice(0, 2) : list;
}

/** The same calendar day `years` ahead, on the owner's calendar rather than a timezone shift. */
export function horizonDate(today: string, years: number) {
  const [year, month, day] = today.split('-').map(Number);
  return calendarIso(new Date(year + years, month - 1, day));
}

export function trackingStartFor(preset: TrackingPreset, today: string, custom: string) {
  if (preset === 'today') return today;
  if (preset === 'year') return today.slice(0, 4) + '-01-01';
  return preset === 'custom' && custom ? custom : null;
}

export type OnboardingGoal = { target: number; horizon: number | 'custom' | null; custom: string };
export const goalTargetDate = (goal: OnboardingGoal, today: string) => goal.horizon === null ? null : goal.horizon === 'custom' ? goal.custom || null : horizonDate(today, goal.horizon);

/** A net-worth goal needs a positive target and a future date; anything less means the step was skipped. The entered target is kept as typed. */
export function onboardingGoalPayload(goal: OnboardingGoal, currency: string, name: string, today: string, id = crypto.randomUUID()) {
  const target_date = goalTargetDate(goal, today);
  if (!(goal.target > 0) || !target_date || target_date <= today) return null;
  return { id, name, kind: 'net_worth' as const, currency, account_id: null, target: goal.target, allocated: 0, target_date, archived: false, monthly_contribution: null, annual_return: 0 };
}

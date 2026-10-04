"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowLeftRight, CalendarClock, ChartNoAxesCombined, ChartPie, Download, EyeOff, Globe, LockKeyhole, Send, Target, Wallet, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { AppPreview } from '@/components/app-preview';
import { usePhoneSignIn } from '@/hooks/use-phone-sign-in';
import { formatMoney } from '@/lib/format';
import { directionOf } from '@/lib/i18n';
import { languageCatalogue } from '@/lib/languages';
import { legalPaths } from '@/lib/legal';
import { signInPath, signUpPath } from '@/lib/sign-in-path';
import styles from './landing-page.module.css';

type Props = {
  brand: ReactNode;
  preferences: ReactNode;
  busy: boolean;
  error: string;
  onDemo: () => void;
};

// Every figure on this page is sample data in one sample currency.
// Figures carry suppressHydrationWarning: the server and a browser can hold different number data for a locale,
// and a differently spaced sample amount must not make React discard the server-rendered page.
const sampleCurrency = 'USD';
// Labels reuse drawer words only where the meaning is the same: "Plan" and "Account" mean an expense plan and a money account in the dictionaries.
const pillars = [
  { key: 'track', label: 'Track', icon: ChartNoAxesCombined, title: 'Know where you stand', text: 'Net worth, cash flow and day-to-day spending, always up to date.' },
  { key: 'budget', label: 'Budget', icon: ChartPie, title: 'A budget that fits your life', text: 'Set monthly limits by category and see what is left before you spend.' },
  { key: 'plan', label: 'Goals', icon: Target, title: 'Goals with a real plan', text: 'Set a target and a date. Hoggish works out the monthly contribution and tracks your progress.' },
  { key: 'invest', label: 'Invest', icon: Wallet, title: 'Compare your returns with other investments', text: 'See how your portfolio does against the S&P 500, Bitcoin, bonds, treasury bills and a bank deposit.' },
] as const;
type Pillar = (typeof pillars)[number]['key'];
const steps = [
  { title: 'Create your account', text: 'Sign up with email or Google, then pick your language and currencies.' },
  { title: 'Add what you have', text: 'Enter accounts, debts and investments, or import your transactions from a file.' },
  { title: 'See the whole picture', text: 'Your dashboard, budget and goals update as you record income and spending.' },
] as const;
const promises: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: LockKeyhole, title: 'Private to your account', text: 'Only you and the people you invite can see your records. Every account is kept separate from the others.' },
  { icon: EyeOff, title: 'No ads, no selling data', text: 'We do not sell your data, show advertising or run tracking scripts in the app.' },
  { icon: Download, title: 'Leave whenever you like', text: 'Download a backup of your data or delete your account at any time.' },
];
const accountRows = [{ kind: 'Cash', value: 4300 }, { kind: 'Deposit', value: 12000 }, { kind: 'Stock', value: 18400 }, { kind: 'Mortgage', value: -96000 }] as const;
const transactionRows = [{ kind: 'Salary', amount: 4200, income: true }, { kind: 'Groceries', amount: 86 }, { kind: 'Household', amount: 45 }, { kind: 'Charity', amount: 25 }] as const;
const recurringRows = [{ kind: 'Rent expense', amount: 900 }, { kind: 'Mortgage', amount: 640 }, { kind: 'Family support', amount: 300 }] as const;

/** Fades its content in the first time it scrolls into view. */
function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') { queueMicrotask(() => setShown(true)); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setShown(true); observer.disconnect(); } }, { rootMargin: '0px 0px -10% 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={[styles.reveal, className].filter(Boolean).join(' ')} data-shown={shown}>{children}</div>;
}


function SampleCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  const { t } = useLanguage();
  return <div className={styles.sampleCard}>
    <div className={styles.sampleHeader}><span><Icon size={16} aria-hidden="true"/>{title}</span><span className={styles.samplePill}>{t('Sample data')}</span></div>
    {children}
  </div>;
}

function AccountsSample() {
  const { t, locale } = useLanguage();
  return <SampleCard title={t('Accounts')} icon={Wallet}>
    <ul className={styles.rows}>{accountRows.map(row => <li key={row.kind} className={styles.row}>
      <CategoryIcon kind={row.kind} size="sm"/><span className={styles.rowName}>{t(row.kind)}</span>
      <span className={styles.rowAmount} suppressHydrationWarning>{formatMoney(row.value, sampleCurrency, locale)}</span>
    </li>)}</ul>
  </SampleCard>;
}

function TransactionsSample() {
  const { t, locale } = useLanguage();
  return <SampleCard title={t('Transactions')} icon={ArrowLeftRight}>
    <ul className={styles.rows}>{transactionRows.map(row => <li key={row.kind} className={styles.row}>
      <CategoryIcon kind={row.kind} size="sm"/><span className={styles.rowName}>{t(row.kind)}</span>
      <span className={'income' in row ? `${styles.rowAmount} ${styles.up}` : styles.rowAmount} dir="ltr" suppressHydrationWarning>{'income' in row ? '+' : ''}{formatMoney(row.amount, sampleCurrency, locale)}</span>
    </li>)}</ul>
  </SampleCard>;
}

function RecurringSample() {
  const { t, locale } = useLanguage();
  return <SampleCard title={t('Recurring')} icon={CalendarClock}>
    <ul className={styles.rows}>{recurringRows.map(row => <li key={row.kind} className={styles.row}>
      <CategoryIcon kind={row.kind} size="sm"/><span className={styles.rowName}>{t(row.kind)}<small>{t('Monthly')}</small></span>
      <span className={styles.rowAmount} suppressHydrationWarning>{formatMoney(row.amount, sampleCurrency, locale)}</span>
    </li>)}</ul>
  </SampleCard>;
}

function LanguagesSample() {
  return <div className={styles.sampleCard}><ul className={styles.languages} aria-hidden="true">{languageCatalogue.map(item => <li key={item.code} lang={item.code} dir={item.dir}>{item.native}</li>)}</ul></div>;
}

function TelegramSample() {
  const { t, locale } = useLanguage();
  return <SampleCard title={t('Telegram')} icon={Send}>
    <div className={styles.chat} aria-hidden="true">
      <p data-from="me">{t('Groceries')} 86</p>
      <p suppressHydrationWarning>{t('Saved')} · {t('Groceries')} · {formatMoney(86, sampleCurrency, locale)}</p>
      <p suppressHydrationWarning>{t('Rent expense')} · {formatMoney(900, sampleCurrency, locale)} · {t('due tomorrow')}</p>
    </div>
  </SampleCard>;
}

// Each pillar opens its own screen of the real app, in the sample workspace.
const pillarPaths: Record<Pillar, string> = { track: '/', budget: '/budget', plan: '/goals', invest: '/assets' };
// The hero steps through the main screens, like a short video of the app.
const heroTour = ['/', '/accounts', '/transactions', '/income-expenses', '/budget', '/goals', '/assets'] as const;

function Feature({ eyebrow, title, text, sample, flip }: { eyebrow: string; title: string; text: string; sample: ReactNode; flip?: boolean }) {
  return <Reveal className={styles.feature}>
    <div className={styles.featureText} data-flip={flip || undefined}><p className={styles.eyebrow}>{eyebrow}</p><h3>{title}</h3><p>{text}</p></div>
    <div className={styles.featureSample}>{sample}</div>
  </Reveal>;
}

/** The public product tour shown at the main page to anyone who is not signed in. */
export function LandingPage({ brand, preferences, busy, error, onDemo }: Props) {
  const { t, language } = useLanguage();
  const [pillar, setPillar] = useState<Pillar>('track');
  const { botUsername } = usePhoneSignIn();
  const active = pillars.find(item => item.key === pillar)!;
  const getStarted = <Button asChild size="lg" className={styles.cta}><Link href={signUpPath}>{t('Get started')}<ArrowRight size={18} aria-hidden="true"/></Link></Button>;
  const demo = <Button type="button" variant="outline" size="lg" className={styles.cta} onClick={onDemo} disabled={busy}>{t('Explore sample workspace')}</Button>;
  // The page carries its own language and direction, so a server-rendered right-to-left tour is laid out correctly before the browser takes over.
  return <div className={styles.page} lang={language} dir={directionOf(language)}>
    <header className={styles.nav}>
      {brand}
      <nav aria-label={t('Product')}><a href="#features">{t('Features')}</a><a href="#how-it-works">{t('How it works')}</a><a href="#privacy">{t('Privacy')}</a></nav>
      <div className={styles.navActions}>{preferences}<Button asChild variant="outline" className={styles.pill}><Link href={signInPath}>{t('Sign in')}</Link></Button><Button asChild className={`${styles.pill} ${styles.navStart}`}><Link href={signUpPath}>{t('Get started')}</Link></Button></div>
    </header>
    <main>
      <section className={styles.hero} aria-labelledby="landing-heading">
        <p className={styles.eyebrow}>{t('YOUR MONEY. THE WHOLE PICTURE.')}</p>
        <h1 id="landing-heading">{t('A clear view.')} <em>{t('A stronger future.')}</em></h1>
        <p className={styles.lead}>{t('From your next payday to your long-term investments.')} {t('Keep your financial life in one place.')}</p>
        <div className={styles.actions}>{getStarted}{demo}</div>
        {error ? <p className={styles.error} role="alert">{t(error)}</p> : <p className={styles.note}>{t('No account needed. Just sample data.')}</p>}
        <div className={styles.heroReplay}><AppPreview eager tour={heroTour}/></div>
      </section>

      <Reveal className={styles.statement}>
        <p className={styles.eyebrow}>{t('WHAT IS HOGGISH?')}</p>
        <h2>{t('One calm place for all your money')}</h2>
        <p>{t('Hoggish brings your accounts, spending, debts and investments into one clear view, so you always know where your money is, where it goes and what comes next.')}</p>
        <ul className={styles.facts}><li><Globe size={16} aria-hidden="true"/>{t('30 languages')}</li><li><Wallet size={16} aria-hidden="true"/>{t('Multiple currencies')}</li><li><EyeOff size={16} aria-hidden="true"/>{t('No ads, no tracking')}</li></ul>
      </Reveal>

      <section id="features" className={styles.pillars} aria-labelledby="pillars-heading">
        <Reveal className={styles.sectionHeading}><h2 id="pillars-heading">{t('Everything you need, in one app')}</h2><p>{t('Add your accounts once, then track, budget, plan and invest from the same place.')}</p></Reveal>
        <Reveal className={styles.pillarGrid}>
          <div className={styles.pillarList}>{pillars.map((item, index) => <button key={item.key} type="button" aria-pressed={item.key === pillar} onClick={() => setPillar(item.key)} style={{ '--pillar-order': index * 2 } as CSSProperties}>
            <span className={styles.eyebrow}><item.icon size={15} aria-hidden="true"/>{t(item.label)}</span><strong>{t(item.title)}</strong><span>{t(item.text)}</span>
          </button>)}</div>
          <div className={styles.pillarSample} style={{ '--pillar-order': pillars.indexOf(active) * 2 + 1 } as CSSProperties}><AppPreview path={pillarPaths[active.key]}/></div>
        </Reveal>
      </section>

      <section className={styles.features}>
        <Feature eyebrow={t('Accounts')} title={t('All your accounts, in one place')} text={t('Cash, deposits, loans and investments sit side by side, grouped by type, each in its own currency.')} sample={<AccountsSample/>}/>
        <Feature flip eyebrow={t('Transactions')} title={t('Every transaction in one list')} text={t('Search, filter and review income and spending in a single list, with a category on every row.')} sample={<TransactionsSample/>}/>
        <Feature eyebrow={t('Recurring')} title={t('Never miss a payment')} text={t('Rent, subscriptions and loan payments show up before they are due, month by month.')} sample={<RecurringSample/>}/>
        {botUsername && <Feature flip eyebrow={t('Telegram')} title={t('Add an expense from a chat')} text={t('Send the amount to the Hoggish bot and it is recorded. Reminders arrive before payments are due.')} sample={<TelegramSample/>}/>}
        <Feature flip={!botUsername} eyebrow={t('Language')} title={t('Your language, your currencies')} text={t('Thirty interface languages, right-to-left included, and the currencies you choose. Totals in different currencies are never mixed.')} sample={<LanguagesSample/>}/>
      </section>

      <section id="how-it-works" className={styles.steps} aria-labelledby="steps-heading">
        <Reveal className={styles.sectionHeading}><p className={styles.eyebrow}>{t('How it works')}</p><h2 id="steps-heading">{t('Up and running in minutes')}</h2></Reveal>
        <Reveal><ol>{steps.map((step, index) => <li key={step.title}><span className={styles.stepNumber} aria-hidden="true">{index + 1}</span><strong>{t(step.title)}</strong><p>{t(step.text)}</p></li>)}</ol></Reveal>
      </section>

      <section id="privacy" className={styles.promises} aria-labelledby="privacy-heading">
        <Reveal className={styles.sectionHeading}><p className={styles.eyebrow}>{t('Privacy')}</p><h2 id="privacy-heading">{t('Your money is your business')}</h2></Reveal>
        <Reveal><ul>{promises.map(item => <li key={item.title}><span className={styles.promiseIcon}><item.icon size={20} aria-hidden="true"/></span><strong>{t(item.title)}</strong><p>{t(item.text)}</p></li>)}</ul></Reveal>
      </section>

      <Reveal className={styles.closing}>
        <h2>{t('Take a clear look at your money.')}</h2>
        <div className={styles.actions}>{getStarted}{demo}</div>
      </Reveal>
    </main>
    <footer className={styles.footer}>
      <div className={styles.footerBrand}>{brand}<p>{t('Personal finance, thoughtfully organized.')}</p></div>
      <nav aria-label={t('Product')}><strong>{t('Product')}</strong><a href="#features">{t('Features')}</a><a href="#how-it-works">{t('How it works')}</a><a href="#privacy">{t('Privacy')}</a></nav>
      <nav aria-label={t('Get started')}><strong>{t('Get started')}</strong><Link href={signInPath}>{t('Sign in')}</Link><Link href={signUpPath}>{t('Create an account')}</Link></nav>
      <nav aria-label={t('Legal')}><strong>{t('Legal')}</strong><Link href={legalPaths.terms}>{t('Terms of use')}</Link><Link href={legalPaths.privacy}>{t('Privacy policy')}</Link></nav>
    </footer>
  </div>;
}

"use client";

import { ChartNoAxesCombined, ChartPie, EyeOff, Globe, Target, TrendingDown, Users, Wallet, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { AppPreview } from '@/components/app-preview';
import { useLanguage } from '@/components/language-provider';
import { formatDate, formatMoney, formatMonthShort, formatPercent } from '@/lib/format';
import styles from './sign-in-screen.module.css';

// The real app in its sample workspace, stepping through the screens people use most. It is laid out at a small
// laptop's width so it stays readable in the panel.
const showcaseTour = ['/', '/accounts', '/income-expenses', '/budget', '/goals'] as const;
const showcaseSize = { width: 1024, height: 680 };
// Sample figures in one sample currency, like the landing page. They carry suppressHydrationWarning because the
// server and a browser can space a localized amount differently.
const sampleCurrency = 'USD';
// Growth of each line since the first month, in percent: the portfolio against the S&P 500 and Bitcoin, as the
// Overview comparison chart draws it.
const series = [
  { key: 'portfolio', label: 'Investments', translate: true, points: [0, 1.8, 1.1, 3.9, 5.2, 4.6, 7.4, 9.1] },
  { key: 'spy', label: 'S&P 500 · SPY', translate: false, points: [0, 1.2, 0.4, 2.1, 3.3, 2.6, 4.2, 5.4] },
  { key: 'btc', label: 'Bitcoin · BTC', translate: false, points: [0, 4.5, -2.8, 1.6, 6.9, -0.7, 3.1, 2.2] },
] as const;
// Projected cash over the coming weeks; its lowest point is marked.
const forecast = [4200, 3900, 3100, 2400, 1240, 2900, 3600, 3300, 4100];
// What sets Hoggish apart, each a feature that exists.
const features: readonly { icon: LucideIcon; label: string }[] = [
  { icon: ChartPie, label: 'Budget' }, { icon: Target, label: 'Goals' }, { icon: Users, label: 'Household' },
  { icon: Globe, label: '30 languages' }, { icon: Wallet, label: 'Multiple currencies' }, { icon: EyeOff, label: 'No ads, no tracking' },
];

const tenth = (value: number) => Math.round(value * 10) / 10;
/** Maps values onto a `width` × `height` box between `low` and `high`, leaving a few pixels at the top and bottom. */
function scale(width: number, height: number, low: number, high: number, count: number) {
  return (value: number, index: number) => [tenth(index / (count - 1) * width), tenth(height - 4 - (value - low) / (high - low || 1) * (height - 8))] as const;
}
const path = (points: readonly number[], at: (value: number, index: number) => readonly [number, number]) =>
  points.map((value, index) => `${index ? 'L' : 'M'}${at(value, index).join(' ')}`).join(' ');

/** `days` from today as `YYYY-MM-DD`. */
function daysAhead(days: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

/** The last `count` calendar months as `YYYY-MM`, oldest first. */
function recentMonths(count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - index), 1)).toISOString().slice(0, 7));
}

function Tile({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return <div className={styles.tile}><p className={styles.tileLabel}>{icon}{label}</p>{children}</div>;
}

/** The panel beside the sign-in card on wide screens: the promise in one line, the app itself, then two of its charts
 * with sample figures and the features that set it apart. */
export function AuthShowcase() {
  const { t, locale } = useLanguage();
  const labels = recentMonths(series[0].points.length);
  const all = series.flatMap(item => item.points);
  const bench = scale(300, 90, Math.min(...all), Math.max(...all), series[0].points.length);
  const cash = scale(200, 64, Math.min(...forecast), Math.max(...forecast), forecast.length);
  const dip = forecast.indexOf(Math.min(...forecast)), [dipX, dipY] = cash(forecast[dip], dip);
  return <aside className={styles.showcase} aria-label={t('Sample data')}>
    <h2 className={styles.showcaseTitle}>{t('Take a clear look at your money.')}</h2>
    <div className={styles.preview}><AppPreview tour={showcaseTour} size={showcaseSize}/></div>
    <div className={styles.tiles} aria-hidden="true">
      <Tile icon={<ChartNoAxesCombined size={14}/>} label={t('Benchmarks')}>
        <span className={styles.benchLegend}>{series.map(item => <span key={item.key}><i data-series={item.key}/>{item.translate ? t(item.label) : item.label}<b dir="ltr" suppressHydrationWarning>+{formatPercent(item.points[item.points.length - 1], locale)}</b></span>)}</span>
        <svg className={styles.benchChart} viewBox="0 0 300 90" preserveAspectRatio="none">
          <path className={styles.benchArea} d={`${path(series[0].points, bench)} L300 90 L0 90 Z`}/>
          {series.map(item => <path key={item.key} data-series={item.key} d={path(item.points, bench)} vectorEffect="non-scaling-stroke"/>)}
        </svg>
        <div className={styles.chartAxis}><small suppressHydrationWarning>{formatMonthShort(labels[0], locale)}</small><small suppressHydrationWarning>{formatMonthShort(labels[labels.length - 1], locale)}</small></div>
      </Tile>
      <Tile icon={<TrendingDown size={14}/>} label={t('Lowest balance ahead')}>
        <p className={styles.tileFigure}><strong suppressHydrationWarning>{formatMoney(forecast[dip], sampleCurrency, locale)}</strong><small suppressHydrationWarning>{formatDate(daysAhead(dip * 7), locale)}</small></p>
        <svg className={styles.cashChart} viewBox="0 0 200 64" preserveAspectRatio="none"><path d={path(forecast, cash)} vectorEffect="non-scaling-stroke"/><circle cx={dipX} cy={dipY} r="4"/></svg>
        <div className={styles.chartAxis}><small>{t('Today')}</small><small suppressHydrationWarning>{formatDate(daysAhead((forecast.length - 1) * 7), locale)}</small></div>
      </Tile>
    </div>
    <ul className={styles.features}>{features.map(({ icon: Icon, label }) => <li key={label}><Icon size={15} aria-hidden="true"/>{t(label)}</li>)}</ul>
  </aside>;
}

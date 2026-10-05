"use client";
import type { ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { shiftDay } from '@/lib/calendar-days';
import { income, type Entry } from '@/lib/finance';
import { formatDate, formatMoney, formatSignedMoney } from '@/lib/format';
import { isMortgagePayment, spendingAmount, transferAmount } from '@/lib/spending';
import { signedAmount } from '@/lib/transaction-list';

/** What a screen reader hears for a row: the action, then its amount and category. */
export const transactionRowLabel = (action: string, record: Entry, category: string, locale: string) => [action, formatSignedMoney(signedAmount(record), record.currency, locale), category].join(' · ');

/** One day: its date and net total in the heading, its transactions below. */
export function DayGroup({ date, total, currency, today, children }: { date: string; total: number | null; currency: string; today: string; children: ReactNode }) {
 const { t, locale } = useLanguage();
 const yesterday = shiftDay(today, -1);
 const label = date === today ? t('Today') : date === yesterday ? t('Yesterday') : formatDate(date, locale);
 return <section className="transaction-day" aria-label={label}>
  <div className="transaction-day-heading"><h3>{label}</h3><span className={total !== null && total > 0 ? 'positive' : undefined}>{total === null ? '—' : formatSignedMoney(total, currency, locale)}</span></div>
  <ul>{children}</ul>
 </section>;
}

/** A mortgage payment's split: the principal is a transfer to the debt, the interest is spending. */
export function MortgageSplit({ record }: { record: Entry }) {
 const { t, locale } = useLanguage();
 if (!isMortgagePayment(record)) return null;
 return <small>{t('Mortgage payment · Principal: {principal} · Interest: {interest}', { principal: formatMoney(transferAmount(record), record.currency, locale), interest: formatMoney(spendingAmount(record), record.currency, locale) })}</small>;
}

/** The row's signed amount by the shared spending definition (`lib/spending.ts`): a mortgage payment shows its interest. */
export function TransactionAmount({ record }: { record: Entry }) {
 const { locale } = useLanguage();
 const incoming = income.includes(record.kind);
 return <strong className={incoming ? 'transaction-amount positive' : 'transaction-amount'}>{formatSignedMoney(signedAmount(record), record.currency, locale)}</strong>;
}

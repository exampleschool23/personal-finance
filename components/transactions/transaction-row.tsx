"use client";
import type { ReactNode } from 'react';
import { useLanguage } from '@/components/language-provider';
import { useDisplayMoney } from '@/components/display-money';
import { shiftDay } from '@/lib/calendar-days';
import { income, type Entry } from '@/lib/finance';
import { formatDate, formatSignedMoney } from '@/lib/format';
import { isMortgagePayment, spendingAmount, transferAmount } from '@/lib/spending';
import { signedAmount } from '@/lib/transaction-list';

/** What a screen reader hears for a row: the action, then its amount (`shown`, the display-currency figure the row shows) and category. */
export const transactionRowLabel = (action: string, record: Entry, category: string, locale: string, shown?: string) => [action, shown ?? formatSignedMoney(signedAmount(record), record.currency, locale), category].join(' · ');

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
 const { t } = useLanguage();
 const { show } = useDisplayMoney();
 if (!isMortgagePayment(record)) return null;
 return <small>{t('Mortgage payment · Principal: {principal} · Interest: {interest}', { principal: show(transferAmount(record), record.currency), interest: show(spendingAmount(record), record.currency) })}</small>;
}

/** The row's signed amount by the shared spending definition (`lib/spending.ts`): a mortgage payment shows its interest. */
export function TransactionAmount({ record }: { record: Entry }) {
 const { showSigned } = useDisplayMoney();
 const incoming = income.includes(record.kind);
 return <strong className={incoming ? 'transaction-amount positive' : 'transaction-amount'}>{showSigned(signedAmount(record), record.currency)}</strong>;
}

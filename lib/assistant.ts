import { z } from 'zod';
import { shiftMonth } from './calendar-days';
import { cashFlowReport } from './cash-flow-report';
import { assets, liabilities, value, type Entry } from './finance';
import { formatDate, formatMoney, formatMonthYear } from './format';
import { isLanguage, locales } from './i18n';
import { convertAmount } from './market';
import { upcomingPayments, type PlanningData } from './planning';
import { monthOccurrences } from './recurring';

/** Characters of conversation sent to the model with one question; older turns beyond it are left out. */
export const assistantHistoryLimit = 12000;
type Turn = { role: 'user' | 'assistant'; content: string };
/** The newest turns that fit the limit, still starting with a question. */
export function recentTurns(list: Turn[], limit = assistantHistoryLimit) {
 let start = 0, size = list.reduce((total, turn) => total + turn.content.length, 0);
 while (size > limit && start < list.length - 1) { size -= list[start].content.length; start++; }
 while (start < list.length - 1 && list[start].role !== 'user') start++;
 return list.slice(start);
}
/** A chat turn sent to /api/assistant. History is capped so one request stays small. */
export const assistantRequestSchema = z.object({
 messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(4000) })).min(1).max(20).refine(list => list[0]?.role === 'user' && list.at(-1)?.role === 'user').transform(list => recentTurns(list)),
 currency: z.string().regex(/^[A-Z]{3}$/),
 rates: z.record(z.string().regex(/^[A-Z]{3}$/), z.number().finite().positive()).refine(value => Object.keys(value).length <= 200),
 language: z.string().max(20),
});

/** The server's answer while no model key is configured; the screen then shows the assistant as unavailable. */
export const assistantUnavailable = 'The assistant is not set up yet.';

export const assistantSuggestions = ['What recurring expenses do I have?', 'How much did I spend last month, and on what?', 'Am I on track with my budget this month?', 'How are my savings goals going?'] as const;

/** A compact, factual snapshot of the user's money for the assistant: holdings, debts, recent cash flow by category,
 * this month's scheduled items and goals. Amounts and dates are written the way the app shows them ("$1,200", "30 September 2026"),
 * in the person's own language and number style, so the assistant repeats them the way they read them everywhere else;
 * a line names its own currency when it has no rate to `currency`. */
export function assistantContext(data: Pick<PlanningData, 'records' | 'categories' | 'goals' | 'occurrences' | 'activity' | 'investmentLinks'>, today: string, currency: string, rates: Record<string, number>, language = 'en') {
 const month = today.slice(0, 7);
 const locale = isLanguage(language) ? locales[language] : locales.en, money = (amount: number, unit = currency) => formatMoney(amount, unit, locale), day = (date: string) => formatDate(date, locale);
 const inCurrency = (amount: number, unit: string) => { const converted = convertAmount(amount, unit, currency, rates); return converted === null ? money(amount, unit) : money(converted); };
 const categoryName = (key: string) => data.categories.find(category => category.id === key)?.name ?? key;
 const records = data.records as Entry[];
 const holdings = records.filter(record => assets.includes(record.kind) && value(record) > 0).map(record => `${record.name} (${record.kind}): ${inCurrency(value(record), record.currency)}`);
 const debts = records.filter(record => liabilities.includes(record.kind) && record.amount > 0).map(record => `${record.name} (${record.kind}): ${inCurrency(record.amount, record.currency)}${record.date ? `, due ${day(record.date)}` : ''}`);
 const months = [shiftMonth(month, -2), shiftMonth(month, -1), month];
 const flows = months.map(item => {
  const report = cashFlowReport(data, [], [item], currency, today, rates);
  const top = report.categories.expense.slice(0, 8).map(entry => `${categoryName(entry.key)} ${money(entry.amount)}`).join(', ');
  return `${formatMonthYear(item, locale)}${item === month ? ' (so far)' : ''}: income ${money(report.income)}, spending ${money(report.expenses)}${top ? ` (${top})` : ''}${report.missing ? `; ${report.missing} amounts in currencies without a rate are left out` : ''}`;
 });
 const recurring = monthOccurrences(records, data.occurrences, month, today).map(item => `${day(item.date)} ${item.record.name} (${item.record.kind}, ${item.record.frequency}): ${inCurrency(item.amount, item.record.currency)}, ${item.status}`);
 const reminders = upcomingPayments(records, data.occurrences, today).filter(item => item.type !== 'scheduled').map(item => `${day(item.date)} ${item.record.name} (${item.record.kind}): ${inCurrency(item.amount, item.record.currency)}${item.overdue ? ', overdue' : ''}`);
 const goals = data.goals.filter(goal => !goal.archived).map(goal => `${goal.name}: ${money(Number(goal.allocated), goal.currency ?? currency)} of ${money(Number(goal.target), goal.currency ?? currency)}${goal.target_date ? ` by ${day(goal.target_date)}` : ''}${goal.funding_monthly ?? goal.monthly_contribution ? `, saving ${money(Number(goal.funding_monthly ?? goal.monthly_contribution), goal.currency ?? currency)} a month` : ''}`);
 const section = (title: string, lines: string[]) => `## ${title}\n${lines.length ? lines.map(line => `- ${line}`).join('\n') : '- none'}`;
 return [`Today is ${day(today)}. Display currency: ${currency}.`, section('Holdings', holdings), section('Debts', debts), section(`Cash flow by month (${currency})`, flows), section(`Scheduled income and bills in ${formatMonthYear(month, locale)}`, recurring), section('Debt and deposit reminders', reminders), section('Savings goals', goals)].join('\n\n');
}

/** The assistant's standing instructions. Kept free of per-user data so it caches. */
export const assistantInstructions = `You are the assistant inside a personal finance app. You answer questions about the user's own money using only the snapshot provided in the conversation, which the app builds from their records.
Answer in the language the user writes in. Be brief and concrete: lead with the answer, then the figures that support it. Use short lists for several items. Write amounts and dates exactly as the snapshot writes them: it uses the user's own number style and month names, with whole amounts. When you compute a new amount, write it the same way, with the same grouping, decimal mark and currency placement. Write every date as day, month name and year, never as numbers joined by dashes, dots or slashes.
If the snapshot does not contain what is needed, say so plainly and suggest where in the app to look or what to record (Transactions, Budget, Recurring, Goals, Accounts, Cash flow).
You explain the user's own figures; you do not give personalised investment, tax or legal advice. When asked for that, explain the general considerations and suggest a qualified professional.`;

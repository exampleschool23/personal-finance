import { z } from 'zod';
import { shiftMonth } from './budget';
import { cashFlowReport } from './cash-flow-report';
import { assets, liabilities, value, type Entry } from './finance';
import { convertAmount } from './market';
import { upcomingPayments, type PlanningData } from './planning';
import { monthOccurrences } from './recurring';

/** A chat turn sent to /api/assistant. History is capped so one request stays small. */
export const assistantRequestSchema = z.object({
 messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(4000) })).min(1).max(20).refine(list => list[0]?.role === 'user' && list.at(-1)?.role === 'user'),
 currency: z.string().regex(/^[A-Z]{3}$/),
 rates: z.record(z.string().regex(/^[A-Z]{3}$/), z.number().finite().positive()).refine(value => Object.keys(value).length <= 200),
 language: z.string().max(20),
});
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

/** The server's answer while no model key is configured; the screen then shows the assistant as unavailable. */
export const assistantUnavailable = 'The assistant is not set up yet.';

export const assistantSuggestions = ['What recurring expenses do I have?', 'How much did I spend last month, and on what?', 'Am I on track with my budget this month?', 'How are my savings goals going?'] as const;

/** A compact, factual snapshot of the user's money for the assistant: holdings, debts, recent cash flow by category,
 * this month's scheduled items and goals. Amounts are whole units of `currency` unless a line names its own currency. */
export function assistantContext(data: Pick<PlanningData, 'records' | 'categories' | 'goals' | 'occurrences' | 'activity' | 'investmentLinks'>, today: string, currency: string, rates: Record<string, number>) {
 const month = today.slice(0, 7);
 const round = (amount: number) => Math.round(amount);
 const inCurrency = (amount: number, unit: string) => { const converted = convertAmount(amount, unit, currency, rates); return converted === null ? `${round(amount)} ${unit}` : `${round(converted)} ${currency}`; };
 const categoryName = (key: string) => data.categories.find(category => category.id === key)?.name ?? key;
 const records = data.records as Entry[];
 const holdings = records.filter(record => assets.includes(record.kind) && value(record) > 0).map(record => `${record.name} (${record.kind}): ${inCurrency(value(record), record.currency)}`);
 const debts = records.filter(record => liabilities.includes(record.kind) && record.amount > 0).map(record => `${record.name} (${record.kind}): ${inCurrency(record.amount, record.currency)}${record.date ? `, due ${record.date}` : ''}`);
 const months = [shiftMonth(month, -2), shiftMonth(month, -1), month];
 const flows = months.map(item => {
  const report = cashFlowReport(data, [], [item], currency, today, rates);
  const top = report.categories.expense.slice(0, 8).map(entry => `${categoryName(entry.key)} ${round(entry.amount)}`).join(', ');
  return `${item}${item === month ? ' (so far)' : ''}: income ${round(report.income)}, spending ${round(report.expenses)}${top ? ` (${top})` : ''}${report.missing ? `; ${report.missing} amounts in currencies without a rate are left out` : ''}`;
 });
 const recurring = monthOccurrences(records, data.occurrences, month, today).map(item => `${item.date} ${item.record.name} (${item.record.kind}, ${item.record.frequency}): ${inCurrency(item.amount, item.record.currency)}, ${item.status}`);
 const reminders = upcomingPayments(records, data.occurrences, today).filter(item => item.type !== 'scheduled').map(item => `${item.date} ${item.record.name} (${item.record.kind}): ${inCurrency(item.amount, item.record.currency)}${item.overdue ? ', overdue' : ''}`);
 const goals = data.goals.filter(goal => !goal.archived).map(goal => `${goal.name}: ${round(Number(goal.allocated))} of ${round(Number(goal.target))} ${goal.currency ?? currency}${goal.target_date ? ` by ${goal.target_date}` : ''}${goal.funding_monthly ?? goal.monthly_contribution ? `, saving ${round(Number(goal.funding_monthly ?? goal.monthly_contribution))} a month` : ''}`);
 const section = (title: string, lines: string[]) => `## ${title}\n${lines.length ? lines.map(line => `- ${line}`).join('\n') : '- none'}`;
 return [`Today is ${today}. Display currency: ${currency}.`, section('Holdings', holdings), section('Debts', debts), section(`Cash flow by month (${currency})`, flows), section(`Scheduled income and bills in ${month}`, recurring), section('Debt and deposit reminders', reminders), section('Savings goals', goals)].join('\n\n');
}

/** The assistant's standing instructions. Kept free of per-user data so it caches. */
export const assistantInstructions = `You are the assistant inside a personal finance app. You answer questions about the user's own money using only the snapshot provided in the conversation, which the app builds from their records.
Answer in the language the user writes in. Be brief and concrete: lead with the answer, then the figures that support it. Use short lists for several items. Format amounts with thousands separators and the currency code, as whole numbers.
If the snapshot does not contain what is needed, say so plainly and suggest where in the app to look or what to record (Transactions, Budget, Recurring, Goals, Accounts, Cash flow).
You explain the user's own figures; you do not give personalised investment, tax or legal advice. When asked for that, explain the general considerations and suggest a qualified professional.`;

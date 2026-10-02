import { goalEmoji } from './goal-emoji';
import type { Goal } from './planning';

/** The "Select goals to add" tiles. The name is a translation key; savings goals reserve cash in an account. */
export type GoalTemplate = { id: string; name: string; emoji: string; kind: 'savings' | 'net_worth' | 'investment' };
export const goalTemplates: readonly GoalTemplate[] = [
 { id: 'emergency', name: 'Emergency fund', emoji: '🧯', kind: 'savings' },
 { id: 'home', name: 'Down payment', emoji: '🏡', kind: 'savings' },
 { id: 'car', name: 'Car', emoji: '🚗', kind: 'savings' },
 { id: 'vacation', name: 'Vacation', emoji: '🏖️', kind: 'savings' },
 { id: 'wedding', name: 'Wedding', emoji: '💍', kind: 'savings' },
 { id: 'education', name: 'Education', emoji: '🎓', kind: 'savings' },
 { id: 'retirement', name: 'Retirement', emoji: '🌅', kind: 'savings' },
 { id: 'savings', name: 'Savings', emoji: '🐷', kind: 'savings' },
 { id: 'net_worth', name: 'Net worth', emoji: '🎯', kind: 'net_worth' },
 { id: 'investment', name: 'Stocks or crypto', emoji: '📈', kind: 'investment' },
];
export const goalSetupSteps = ['select', 'targets', 'contribution', 'budget'] as const;
export type GoalSetupStep = (typeof goalSetupSteps)[number];
/** At most this many goals of one template in a single pass. */
export const maxPerTemplate = 5;

/** How many of the person's active goals already look like this template ("1 goal already added"). */
export function alreadyAdded(template: GoalTemplate, goals: readonly Goal[]) {
 return goals.filter(goal => !goal.archived && (goal.kind ?? 'savings') === template.kind && goalEmoji(goal) === template.emoji).length;
}

/** Cash accounts a savings goal can keep its money in: only accounts in the goal's own currency, so the target and the reserved cash never mix currencies. */
type CashAccount = { id: string; currency: string };
export const goalAccountOptions = <T extends CashAccount>(accounts: readonly T[], currency: string | null | undefined) => accounts.filter(account => account.currency === currency);
/** Currencies a savings goal can use: those of the person's cash accounts, preferred currencies first. */
export function savingsCurrencies(accounts: readonly CashAccount[], preferred: readonly string[]) {
 const held = new Set(accounts.map(account => account.currency));
 return [...new Set([...preferred.filter(code => held.has(code)), ...accounts.map(account => account.currency)])];
}
/** A new savings goal uses the primary currency and its first account in it; without one, the first cash account and its currency. */
export function savingsDefaults(accounts: readonly CashAccount[], primary: string) {
 const account = goalAccountOptions(accounts, primary)[0] ?? accounts[0] ?? null;
 return { currency: account?.currency ?? primary, account_id: account?.id ?? null };
}
/** Changing a savings goal's currency moves it to the first cash account in that currency. */
export const withSavingsCurrency = (goal: Goal, currency: string, accounts: readonly CashAccount[]): Goal => ({ ...goal, currency, account_id: goalAccountOptions(accounts, currency)[0]?.id ?? null });

/** One new goal per selected tile, in the order the tiles were picked, numbered when a tile was picked more than once.
 * Every goal starts in the primary currency; a savings goal also starts in a cash account in that currency when there is one. */
export type SetupDraft = { template: string; goal: Goal };
export function setupDrafts(counts: Readonly<Record<string, number>>, label: (template: GoalTemplate) => string, defaults: { currency: string; accounts: readonly CashAccount[] }, newId: () => string, kept: readonly SetupDraft[] = []): SetupDraft[] {
 const picked = Object.keys(counts).map(id => goalTemplates.find(template => template.id === id)).filter((template): template is GoalTemplate => !!template && template.kind !== 'investment');
 return picked.flatMap(template => {
  const count = Math.max(0, Math.min(maxPerTemplate, Math.floor(counts[template.id] ?? 0)));
  return Array.from({ length: count }, (_, index) => {
   // Drafts already filled in for this tile keep their edits when the person comes back to change the selection.
   const previous = kept.filter(draft => draft.template === template.id)[index];
   if (previous) return previous;
   const savings = template.kind === 'savings' ? savingsDefaults(defaults.accounts, defaults.currency) : { currency: defaults.currency, account_id: null };
   return { template: template.id, goal: { id: newId(), name: count > 1 ? `${label(template)} ${index + 1}` : label(template), kind: template.kind as 'savings' | 'net_worth', ...savings, target: 0, allocated: 0, target_date: null, archived: false, monthly_contribution: null, annual_return: 0 } };
  });
 });
}
/** Picking a tile adds it after the tiles already picked; clearing it forgets its place. */
export function pickTemplate(counts: Readonly<Record<string, number>>, id: string, count: number): Record<string, number> {
 const next = { ...counts };
 const value = Math.max(0, Math.min(maxPerTemplate, Math.floor(count)));
 if (value) next[id] = value; else delete next[id];
 return next;
}

/** What still blocks a draft on a step, as translation keys; empty when it can go on. These mirror the server's goal rules. */
export function draftProblems(goal: Goal, step: GoalSetupStep, today: string): string[] {
 const problems: string[] = [];
 if (step === 'targets') {
  if (!goal.name.trim()) problems.push('Enter a name.');
  if (!(goal.target > 0)) problems.push('Enter a target amount.');
  if (goal.kind === 'net_worth' && !goal.target_date) problems.push('Choose a target date.');
  if (goal.target_date && goal.target_date < today) problems.push('Choose a date from today on.');
 }
 if (step === 'contribution' && goal.kind === 'savings') {
  if (!goal.account_id) problems.push('Choose a cash account.');
  if (goal.allocated < 0 || goal.allocated > goal.target) problems.push('Already saved cannot be more than the target.');
 }
 if (step === 'budget' && goal.monthly_contribution !== null && goal.monthly_contribution !== undefined && goal.monthly_contribution < 0) problems.push('Enter a monthly amount of zero or more.');
 return problems;
}

/** A step can be left when every draft passes it, and every step up to it. */
export function canContinue(drafts: readonly Goal[], step: GoalSetupStep, today: string) {
 if (step === 'select') return drafts.length > 0;
 const upTo = goalSetupSteps.slice(1, goalSetupSteps.indexOf(step) + 1);
 return drafts.length > 0 && drafts.every(goal => upTo.every(each => !draftProblems(goal, each, today).length));
}

/** Planned monthly contributions per currency, listed rather than added across currencies. */
export function monthlyTotals(drafts: readonly Goal[]) {
 const totals = new Map<string, number>();
 for (const goal of drafts) totals.set(goal.currency ?? '', (totals.get(goal.currency ?? '') ?? 0) + Math.max(0, Number(goal.monthly_contribution ?? 0)));
 return [...totals].map(([currency, amount]) => ({ currency, amount }));
}

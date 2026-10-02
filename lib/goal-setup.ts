import { goalEmoji } from './goal-emoji';
import type { Goal } from './planning';

/** Monarch's "Select goals to add" tiles. The name is a translation key; savings goals reserve cash in an account. */
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

/** One new goal per selected tile, numbered when a tile was picked more than once.
 * Savings goals start in the first cash account; net-worth goals in the display currency. */
export type SetupDraft = { template: string; goal: Goal };
export function setupDrafts(counts: Readonly<Record<string, number>>, label: (template: GoalTemplate) => string, defaults: { currency: string; account: { id: string; currency: string } | null }, newId: () => string, kept: readonly SetupDraft[] = []): SetupDraft[] {
 return goalTemplates.filter(template => template.kind !== 'investment').flatMap(template => {
  const count = Math.max(0, Math.min(maxPerTemplate, Math.floor(counts[template.id] ?? 0)));
  return Array.from({ length: count }, (_, index) => {
   // Drafts already filled in for this tile keep their edits when the person comes back to change the selection.
   const previous = kept.filter(draft => draft.template === template.id)[index];
   if (previous) return previous;
   const savings = template.kind === 'savings';
   return { template: template.id, goal: { id: newId(), name: count > 1 ? `${label(template)} ${index + 1}` : label(template), kind: template.kind as 'savings' | 'net_worth', currency: savings ? defaults.account?.currency ?? defaults.currency : defaults.currency, account_id: savings ? defaults.account?.id ?? null : null, target: 0, allocated: 0, target_date: null, archived: false, monthly_contribution: null, annual_return: 0 } };
  });
 });
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

import { archivedIn, type ArchivePause } from './finance';
import type { ExpensePlan } from './expense-plans';

export { archivedIn, type ArchivePause };

/** The spending plans of a month: an archived plan stays in the months before its archive and is back from its restore month. */
export const plansOfMonth = <T extends ExpensePlan>(plans: readonly T[], month: string) => plans.filter(plan => !archivedIn(plan, month));

/** The pauses after archiving or restoring today, as the database trigger keeps them (for the sample workspace). */
export function nextArchivePauses(pauses: readonly ArchivePause[] | null | undefined, archived: boolean, today: string): ArchivePause[] {
 const list = pauses ?? [];
 if (archived) return [...list, { from: today, to: null }];
 return list.filter(pause => !(pause.to === null && pause.from === today)).map(pause => pause.to === null ? { ...pause, to: today } : pause);
}

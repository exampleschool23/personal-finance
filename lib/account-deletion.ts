import type { PlanningData } from './planning';

/** Shown when an account cannot be deleted because other items still point to it. */
export const linkedAccountMessage = 'This account has linked transactions, transfers or goals. Delete or move them first, or keep the account.';

/** Whether a cash or deposit account is still used by loaded transactions, operations, transfers, goals or investment payments.
 * The database makes the final check, so an account referenced by history that is not loaded is still refused there. */
export function accountHasLinks(id: string, data: Pick<PlanningData, 'records' | 'goals' | 'activity' | 'movements' | 'investmentLinks'>): boolean {
 return data.records.some(record => record.account_id === id)
  || data.goals.some(goal => goal.account_id === id)
  || data.activity.some(item => item.account_id === id || item.target_id === id)
  || (data.movements ?? []).some(item => item.source_id === id || item.target_id === id)
  || (data.investmentLinks ?? []).some(item => item.account_id === id);
}

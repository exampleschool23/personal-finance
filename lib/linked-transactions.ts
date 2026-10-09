import type { Entry } from './finance';

/** A transaction written by a larger action: a transfer or trade, an account operation, a mortgage payment or an asset
 * tracker update. It cannot be edited on its own; deleting it undoes the whole action (migration 126). */
export const isLinkedTransaction = (record: Pick<Entry, 'movement_id' | 'operation_id' | 'mortgage_payment_id' | 'history_event_id'>) =>
 !!(record.movement_id || record.operation_id || record.mortgage_payment_id || record.history_event_id);

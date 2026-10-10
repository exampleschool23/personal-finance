import { cashFlowAmountMissing, requiresCashAccount } from './cash-account-required';
import { depositToday } from './deposit-interest';
import { isBusinessAccount } from './business';
import { expenses, liabilities, simpleInterestKinds, type Entry } from './finance';

const today = depositToday;

/** A blank record for a form to fill in, dated today. */
export const freshEntry = (): Entry => ({ id: crypto.randomUUID(), name: '', kind: 'Cash', currency: 'USD', amount: 0, quantity: 1, cost: 0, rate: 0, date: today(), lent_date: today(), frequency: 'Once', notes: '', business_id: null, ownership_percentage: 100, estimated_monthly_income: 0, estimated_monthly_payment: 0 });

/** The rule a record breaks before it is sent, named as the server would name it; empty when it may be saved. */
export function recordSaveProblem(editing: Entry) {
 const dateProblem = editing.kind === 'Money lent' ? (!editing.lent_date ? 'Date lent is required.' : editing.date && editing.date < editing.lent_date ? 'Due date must not precede lending date.' : '')
  : !editing.date ? 'Date is required.' : simpleInterestKinds.includes(editing.kind) && editing.opened_on && editing.date < editing.opened_on ? 'The maturity date cannot be before the purchase date.' : '';
 if (dateProblem) return dateProblem;
 if (cashFlowAmountMissing(editing)) return 'Enter an amount greater than zero.';
 if (requiresCashAccount(editing) && editing.date > today()) return 'Actual income and expenses cannot be dated in the future.';
 return '';
}

/** The name an expense is saved under when left blank: its note, its custom category, or its kind's key, which
 * `shownName` reads in the current language. */
export function expenseName(editing: Entry, categoryName: string | undefined, kindName: string) {
 return expenses.includes(editing.kind) && !editing.name.trim() ? (editing.notes.trim().slice(0, 120) || categoryName || kindName) : editing.name;
}

/** Income or spending is booked to a cash account of the workspace (once the accounts have loaded, `ready`), and in
 * another currency only at a known rate. */
export function cashAccountProblem(editing: Entry, records: readonly Entry[], ready: boolean, rate: number) {
 const account = records.find(record => record.id === editing.account_id);
 if (requiresCashAccount(editing) && (!editing.account_id || !ready || account?.kind !== 'Cash')) return 'Choose a cash account.';
 if (editing.account_id && account?.currency !== editing.currency && (!Number.isFinite(rate) || rate <= 0)) return 'Historical exchange rates are unavailable.';
 return '';
}

/** In the sample workspace, which checks no database, a scheduled payment is recorded once per due date. */
export const duplicateScheduledPayment = (editing: Entry, rows: readonly Entry[], dueOn: string | null | undefined) =>
 !!dueOn && rows.some(row => row.id !== editing.id && row.earning_source_id === editing.earning_source_id && row.earning_due_on === dueOn);

/** Likewise a salary payment, once per pay day of its income source. */
export const duplicateSalaryPayment = (editing: Entry, rows: readonly Entry[], dueOn: string | null | undefined) =>
 editing.kind === 'Salary' && !!editing.income_source_id && rows.some(row => row.id !== editing.id && row.income_source_id === editing.income_source_id && row.income_due_on === dueOn);

/** The sample workspace's copy of name_scheduled_payment for a source receipt or a salary with a plan (migration 140):
 * the row names the schedule it pays and the due date it chose, so the income cards and Recurring join it by that one id. */
export function demoScheduleLink(editing: Entry, patch: Pick<Entry, 'earning_due_on' | 'income_due_on'>, sources: readonly { id: string; schedule_id?: string | null }[]): Partial<Entry> {
 if (editing.frequency !== 'Once' || editing.occurrence_record_id) return {};
 const source = sources.find(source => source.id === editing.earning_source_id);
 if (source && patch.earning_due_on) return { occurrence_record_id: source.schedule_id ?? source.id, occurrence_due_on: patch.earning_due_on };
 if (editing.kind === 'Salary' && editing.income_source_id && patch.income_due_on) return { occurrence_record_id: editing.income_source_id, occurrence_due_on: patch.income_due_on };
 return {};
}

/** A debt starts when it is first saved, never in the future and never after it is due. */
export const debtDatesProblem = (record: Entry) => liabilities.includes(record.kind) && record.opened_on && (record.opened_on > today() || record.date < record.opened_on) ? 'Check the start and due dates.' : '';

/** The business a saved account had, when the form moves it to another: the account is saved in its old business
 * and then moved, so its transactions move with it. */
export function businessMoveFrom(editing: Entry, saved: Entry | undefined) {
 return isBusinessAccount(editing) && saved && (saved.business_id ?? null) !== (editing.business_id ?? null) ? { from: saved.business_id ?? null } : null;
}

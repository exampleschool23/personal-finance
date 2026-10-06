// The fixed workspace every browser test starts from, saved through the app's own API so balances, history and
// schedules are built by the same code as in production. It includes the shapes that hid bugs in live QA: two
// expenses saved minutes apart on one day, a schedule entered with a start two years back, a loan with a monthly
// payment, a holding without a live price and an account in a second currency.
const tashkentDay = (offsetDays = 0) => {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};
const yearsAgo = years => { const date = new Date(tashkentDay() + 'T00:00:00Z'); date.setUTCFullYear(date.getUTCFullYear() - years); return date.toISOString().slice(0, 10); };
export const today = tashkentDay();
const id = n => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = { quantity: 1, cost: 0, rate: 0, frequency: 'Once', notes: '', estimated_monthly_payment: 0, estimated_monthly_income: 0, ownership_percentage: 100 };

export const ids = { checking: id(1), savings: id(2), euro: id(3), empty: id(4), coffee: id(10), lunch: id(11), bonus: id(12), gym: id(20), loan: id(30), stock: id(40) };
export const accounts = {
  checking: { ...base, id: ids.checking, name: 'E2E Checking', kind: 'Cash', currency: 'USD', amount: 5000, date: today, opened_on: tashkentDay(-60) },
  savings: { ...base, id: ids.savings, name: 'E2E Savings', kind: 'Cash', currency: 'USD', amount: 10000, date: today, opened_on: tashkentDay(-60) },
  euro: { ...base, id: ids.euro, name: 'E2E Euro', kind: 'Cash', currency: 'EUR', amount: 2000, date: today, opened_on: tashkentDay(-60) },
  empty: { ...base, id: ids.empty, name: 'E2E Empty', kind: 'Cash', currency: 'USD', amount: 0, date: today, opened_on: tashkentDay(-60) },
};
// Saved in this order; the lunch is the newest transaction of the day.
export const transactions = [
  { ...base, id: ids.bonus, name: 'E2E Bonus', kind: 'Other income', currency: 'USD', amount: 300, date: today, account_id: ids.checking },
  { ...base, id: ids.coffee, name: 'E2E Coffee', kind: 'Other expense', currency: 'USD', amount: 4.5, date: today, account_id: ids.checking },
  { ...base, id: ids.lunch, name: 'E2E Lunch', kind: 'Living expense', currency: 'USD', amount: 12.75, date: today, account_id: ids.checking },
];
export const others = [
  { ...base, id: ids.gym, name: 'E2E Gym', kind: 'Living expense', currency: 'USD', amount: 40, date: yearsAgo(2), frequency: 'Monthly' },
  { ...base, id: ids.loan, name: 'E2E Car loan', kind: 'Loan', currency: 'USD', amount: 5000, rate: 7, date: yearsAgo(-2), opened_on: today, estimated_monthly_payment: 300 },
  { ...base, id: ids.stock, name: 'AAPL', kind: 'Stock', currency: 'USD', amount: 200, quantity: 2, cost: 150, date: today },
];

// What the fixture adds up to, worked out by hand.
export const expected = {
  checking: 5000 + 300 - 4.5 - 12.75, // 5,282.75
  spendingThisMonth: 4.5 + 12.75, // 17.25
  incomeThisMonth: 300,
  usdCash: 5000 + 300 - 4.5 - 12.75 + 10000 + 0, // 15,282.75
};
export const settings = { display_name: 'E2E Tester', language: 'en', currencies: ['USD', 'EUR'], country: 'DE', font: 'inter', onboarded: true };

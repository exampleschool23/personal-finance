import type { Kind } from './finance';
// Stable colors shared by badges and category charts; never derive from row order.
export const categoryHues: Record<Kind, number> = {
  Cash: 145, Stock: 215, Crypto: 32, Deposit: 180,
  Property: 270, Business: 240, 'Money lent': 195,
  Mortgage: 350, Loan: 15, Debt: 0,
  Salary: 120, 'Rent income': 165, 'Other income': 85,
  'Rent expense': 310, 'Living expense': 48, Charity: 290, 'Other expense': 330,
};
export const categoryColor = (kind: string) => `hsl(${categoryHues[kind as Kind] ?? 210} 60% 48%)`;

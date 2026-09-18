import type { Kind } from './finance';
// Stable colors shared by badges and category charts; never derive from row order.
export type CategoryKind = Kind | 'Groceries' | 'Family support' | 'Household' | 'Other';
export const categoryHues: Record<CategoryKind, number> = {
  Groceries: 48, 'Family support': 195, Household: 270, Other: 330,
  Cash: 145, Stock: 215, Crypto: 32, Deposit: 180,
  Property: 270, Business: 42, 'Money lent': 195,
  Mortgage: 350, Loan: 15, Debt: 0,
  Salary: 120, 'Rent income': 165, 'Business income': 42, 'Other income': 85,
  'Rent expense': 310, 'Living expense': 48, Charity: 290, 'Other expense': 330,
};
export function categoryHue(kind:string){ if(Object.hasOwn(categoryHues,kind))return categoryHues[kind as CategoryKind]; let hash=0;for(const char of kind)hash=(hash*31+char.charCodeAt(0))>>>0;return hash%360; }
export const categoryColor = (kind: string) => `hsl(${categoryHue(kind)} 60% 48%)`;

/** A holding's quantity, purchase price per unit and total purchase cost: the two entered last decide the third. */
export type HoldingCostField = 'quantity' | 'cost' | 'total';
export type HoldingCost = { quantity: number; cost: number; total: number; /** The two fields entered last, newest first. */ recent: HoldingCostField[] };

// Unit quotes and fractional units keep up to eight decimals, as `formatMoney`'s unitPrice does.
const unit = (value: number) => Math.round(value * 1e8) / 1e8;

/** A saved or new holding: the total follows its quantity and unit price. */
export function holdingCostStart(quantity: number, cost: number): HoldingCost {
 return { quantity, cost, total: quantity * cost, recent: ['quantity', 'cost'] };
}

/** One entered value, with the field not among the two entered last worked out from them. A division by zero leaves
 * that field as it was. */
export function changeHoldingCost(state: HoldingCost, field: HoldingCostField, value: number): HoldingCost {
 const recent = [field, ...state.recent.filter(item => item !== field)].slice(0, 2);
 const next = { ...state, [field]: value, recent };
 const derived = (['quantity', 'cost', 'total'] as const).find(item => !recent.includes(item))!;
 if (derived === 'total') next.total = next.quantity * next.cost;
 else if (derived === 'cost' && next.quantity > 0) next.cost = unit(next.total / next.quantity);
 else if (derived === 'quantity' && next.cost > 0) next.quantity = unit(next.total / next.cost);
 return next;
}

/** The total as the field shows it: as typed, or a worked-out total in whole amounts. */
export const shownHoldingTotal = (state: HoldingCost) => state.recent.includes('total') ? state.total : Math.round(state.total);

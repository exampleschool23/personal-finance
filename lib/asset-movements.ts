import { unitPricedKinds, type Entry } from './finance';
import { formatNumber } from './format';
import { metalWeight } from './precious-metals';

export type MovementKind = 'transfer' | 'buy' | 'sell' | 'interest';
export type AssetMovement = {
 exchange_rate?:number;
 id: string; kind: MovementKind; source_id: string; target_id: string;
 sent: number; received: number; source_value: number; target_value: number;
 fee: number; date: string; notes: string;
};
/** Anything held in units at a quoted price (stocks, crypto, precious metals, vested equity): bought and sold by quantity. */
export const isHolding = (record: Pick<Entry, 'kind'>) => unitPricedKinds.includes(record.kind);
/** A holding's quantity in words: "1 unit", "0.55 units". */
export const unitCount = (t: (key: string, params?: Record<string, string | number>) => string, quantity: number, locale: string) => quantity === 1 ? t('1 unit') : t('{quantity} units', { quantity: formatNumber(quantity, locale, 8) });
/** A holding's quantity as it is held: a metal by its weight ("6 troy oz", "100 g"), anything else in units. */
export const holdingQuantity = (t: (key: string, params?: Record<string, string | number>) => string, record: Pick<Entry, 'kind' | 'metal_unit'>, quantity: number, locale: string) =>
 record.kind === 'Precious metals' ? metalWeight({ quantity, metal_unit: record.metal_unit }, locale, t) : unitCount(t, quantity, locale);
const isBalanceAccount = (record: Pick<Entry, 'kind'>) => record.kind === 'Cash' || record.kind === 'Deposit';
export function movementSources(kind: MovementKind, records: Entry[]) {
 return records.filter(record => kind === 'transfer' ? isBalanceAccount(record) : kind === 'interest' ? record.kind === 'Deposit' : kind === 'sell' ? isHolding(record) : (isBalanceAccount(record) || isHolding(record)));
}
export function movementTargets(kind: MovementKind, source: Entry | undefined, records: Entry[]) {
 return records.filter(record => record.id !== source?.id && (kind === 'transfer' ? isBalanceAccount(record) : kind === 'buy' ? isHolding(record) : (isBalanceAccount(record) || isHolding(record))));
}

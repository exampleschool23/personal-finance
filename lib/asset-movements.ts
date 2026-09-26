import type { Entry } from './finance';

export type MovementKind = 'transfer' | 'buy' | 'sell' | 'interest';
export type AssetMovement = {
 exchange_rate?:number;
 id: string; kind: MovementKind; source_id: string; target_id: string;
 sent: number; received: number; source_value: number; target_value: number;
 fee: number; date: string; notes: string;
};
export const isHolding = (record: Pick<Entry, 'kind'>) => record.kind === 'Stock' || record.kind === 'Crypto';
export const isBalanceAccount = (record: Pick<Entry, 'kind'>) => record.kind === 'Cash' || record.kind === 'Deposit';
export function movementSources(kind: MovementKind, records: Entry[]) {
 return records.filter(record => kind === 'transfer' ? isBalanceAccount(record) : kind === 'interest' ? record.kind === 'Deposit' : kind === 'sell' ? isHolding(record) : ['Cash','Deposit','Stock','Crypto'].includes(record.kind));
}
export function movementTargets(kind: MovementKind, source: Entry | undefined, records: Entry[]) {
 return records.filter(record => record.id !== source?.id && (kind === 'transfer' ? isBalanceAccount(record) : kind === 'buy' ? isHolding(record) : ['Cash','Deposit','Stock','Crypto'].includes(record.kind)));
}

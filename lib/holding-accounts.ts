import { value, type Entry } from './finance';
import { marketEntry, type MarketData } from './market';

export type HoldingAccount = { id: string; name: string; kind: 'Stock' | 'Crypto'; currency: string };
export const holdingAccountLabel = (kind: HoldingAccount['kind']) => kind === 'Stock' ? 'Stock account' : 'Crypto account';
export function holdingAccountValue(account: HoldingAccount, records: Entry[], market: MarketData | null) {
 const holdings = records.filter(record => record.holding_account_id === account.id && (record.kind === account.kind || record.kind === 'Cash'));
 const converted = holdings.map(record => marketEntry(record, account.currency, market));
 return { holdings, total: converted.some(record => record === null) ? null : converted.reduce((sum, record) => sum + value(record!), 0) };
}

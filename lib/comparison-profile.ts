import type { DiversifiedPortfolio } from './diversified-portfolio';
import { assetKinds, type Entry } from './finance';
/** Every kind of holding can be compared with a benchmark: the assets of lib/finance.ts. */
export const investmentKinds = assetKinds;
export const benchmarkKeys = ['BTC','SPY','HYG','BIL','depositUZS','depositUSD','CUSTOM','PORTFOLIO'] as const;
export type BenchmarkKey = typeof benchmarkKeys[number] | `STOCK:${string}`;
export type ComparisonPreferences = { benchmarks: BenchmarkKey[]; custom_symbol: string; portfolio?: DiversifiedPortfolio | null };
export type BaselineHolding = { id: string; kind: typeof investmentKinds[number]; currency: string; balance: number };
export type ComparisonBaseline = { starting_amount: number; currency: string; capital_as_of: string; holdings: BaselineHolding[] };
export type ComparisonProfile = { owner_id?: string; activity: { started_at: string; source:'first_visit'|'earliest_record' }; preferences: ComparisonPreferences; baseline: ComparisonBaseline | null; tracking_start: string | null };
export const defaultComparisonPreferences: ComparisonPreferences = { benchmarks:['BTC','SPY','depositUSD'],custom_symbol:'' };

/** Cash is an investment only when it was opted in or sits in an investment account; a plain bank account or wallet is not. */
export const isInvestmentRecord = (record:Entry) => record.kind==='Cash' ? record.is_investment===true||!!record.holding_account_id : (investmentKinds as readonly string[]).includes(record.kind);

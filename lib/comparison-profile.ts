import type { DiversifiedPortfolio } from './diversified-portfolio';
import type { Entry } from './finance';
export const investmentKinds = ['Cash','Stock','Crypto','Deposit','Property','Business','Money lent'] as const;
export const benchmarkKeys = ['BTC','SPY','HYG','depositUZS','depositUSD','CUSTOM','PORTFOLIO'] as const;
export type BenchmarkKey = typeof benchmarkKeys[number] | `STOCK:${string}`;
export type ComparisonPreferences = { benchmarks: BenchmarkKey[]; custom_symbol: string; portfolio?: DiversifiedPortfolio | null };
export type BaselineHolding = { id: string; kind: typeof investmentKinds[number]; currency: string; balance: number };
export type ComparisonBaseline = { starting_amount: number; currency: string; capital_as_of: string; holdings: BaselineHolding[] };
export type ComparisonProfile = { owner_id?: string; activity: { started_at: string; source:'first_visit'|'earliest_record' }; preferences: ComparisonPreferences; baseline: ComparisonBaseline | null };
export const defaultComparisonPreferences: ComparisonPreferences = { benchmarks:['BTC','SPY','depositUZS','depositUSD'],custom_symbol:'' };

export const isInvestmentRecord = (record:Entry) => record.kind==='Cash' ? record.is_investment===true : (investmentKinds as readonly string[]).includes(record.kind);

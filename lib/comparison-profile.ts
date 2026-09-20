import type { Entry } from './finance';
export const investmentKinds = ['Cash','Stock','Crypto','Deposit','Property','Business','Money lent'] as const;
export const benchmarkKeys = ['BTC','SPY','HYG','depositUZS','depositUSD','CUSTOM'] as const;
export type BenchmarkKey = typeof benchmarkKeys[number];
export type ComparisonPreferences = { benchmarks: BenchmarkKey[]; custom_symbol: string };
export type BaselineHolding = { id: string; kind: typeof investmentKinds[number]; currency: string; balance: number };
export type ComparisonBaseline = { starting_amount: number; currency: string; capital_as_of: string; holdings: BaselineHolding[] };
export type ComparisonProfile = { activity: { started_at: string; source:'first_visit'|'earliest_record' }; preferences: ComparisonPreferences; baseline: ComparisonBaseline | null };
export const defaultComparisonPreferences: ComparisonPreferences = { benchmarks:['BTC','SPY','depositUZS','depositUSD'],custom_symbol:'' };

export const isInvestmentRecord = (record:Entry) => record.kind==='Cash' ? record.is_investment===true : (investmentKinds as readonly string[]).includes(record.kind);

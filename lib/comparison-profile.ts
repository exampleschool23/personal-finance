import type { DiversifiedPortfolio } from './diversified-portfolio';
import type { Entry } from './finance';
export const investmentKinds = ['Cash','Stock','Crypto','Precious metals','Equity compensation','Deposit','Treasury bill','Bond','Retirement account','Property','Business','Vehicle','Valuables','Money lent'] as const;
export const benchmarkKeys = ['BTC','SPY','HYG','BIL','depositUZS','depositUSD','CUSTOM','PORTFOLIO'] as const;
export type BenchmarkKey = typeof benchmarkKeys[number] | `STOCK:${string}`;
export type ComparisonPreferences = { benchmarks: BenchmarkKey[]; custom_symbol: string; portfolio?: DiversifiedPortfolio | null };
export type BaselineHolding = { id: string; kind: typeof investmentKinds[number]; currency: string; balance: number };
export type ComparisonBaseline = { starting_amount: number; currency: string; capital_as_of: string; holdings: BaselineHolding[] };
export type ComparisonProfile = { owner_id?: string; activity: { started_at: string; source:'first_visit'|'earliest_record' }; preferences: ComparisonPreferences; baseline: ComparisonBaseline | null; tracking_start: string | null };
export const defaultComparisonPreferences: ComparisonPreferences = { benchmarks:['BTC','SPY','depositUSD'],custom_symbol:'' };

export const isInvestmentRecord = (record:Entry) => record.kind==='Cash' ? record.is_investment===true : (investmentKinds as readonly string[]).includes(record.kind);

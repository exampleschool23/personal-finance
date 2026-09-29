import type { Entry } from './finance';
import type { HistoryEvent } from './investment-history';
import type { MarketData } from './market';

export type InvestmentPortfolioInput={records:Entry[];events:HistoryEvent[];cashflows?:Entry[];market:MarketData|null;currency:string;today:string};

// Value growth and return after funding answer different questions. Keep both
// explicit so consuming screens cannot substitute one for the other.
export function investmentValueChange(values: readonly (number | null)[]) {
 if(values.length<2||values[0]===null||values.at(-1)===null)return null;
 return values.at(-1)!-values[0]!;
}

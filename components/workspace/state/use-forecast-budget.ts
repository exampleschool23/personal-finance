"use client";
import { useMemo } from 'react';
import type { WorkspaceBudget } from '@/hooks/use-budget';
import { monthActuals } from '@/lib/budget';
import { forecastBudget, type ForecastBudget } from '@/lib/budget-forecast';
import type { CashForecastBudget } from '@/lib/cash-forecast';
import { depositToday } from '@/lib/deposit-interest';
import { marketRates, type MarketData } from '@/lib/market';
import type { PlanningData } from '@/lib/planning';
import type { TransactionSplit } from '@/lib/transaction-tools';

type Input = { budget: Pick<WorkspaceBudget, 'state' | 'loading' | 'error'>; data: PlanningData; splits: TransactionSplit[]; currency: string; market: MarketData | null };

/** The workspace's Budget as the forecasts read it: the monthly estimate (Overview, Cash flow, Goals) counts each
 * budget, and the projected cash spends what is left of it. `budget` is the provider's one copy, so a Budget edit
 * reaches every forecast at once. `ready` waits for the saved budget, so a forecast never shows without it;
 * `missing` counts budgets of `month` that no rate converts. */
export function useForecastBudget({ budget, data, splits, currency, market }: Input) {
 const removed = data.removedKinds;
 const view: ForecastBudget = useMemo(() => forecastBudget({ state: budget.state, categories: data.categories, removed: removed ?? [] }), [budget.state, data.categories, removed]);
 const rates = marketRates(market);
 const today = depositToday();
 const spent = useMemo(() => monthActuals(data, splits, today.slice(0, 7), currency, today, rates).byCategory, [data, splits, today, currency, rates]);
 const cash: CashForecastBudget = useMemo(() => ({ linesFor: month => view.linesIn(month, currency, rates), spent }), [view, currency, rates, spent]);
 return { ready: !budget.loading && !budget.error, loading: budget.loading, error: budget.error, linesIn: (month: string) => view.linesIn(month, currency, rates), view, cash };
}

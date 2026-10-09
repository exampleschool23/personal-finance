"use client";
import dynamic from 'next/dynamic';
import { chartHeight } from '@/components/presentation-foundation/chart';
import { ChartSkeleton } from '@/components/presentation-foundation/loading-placeholder';

// The chart library is large, and the Overview route also serves the public landing page at `/`. Every chart that
// route reaches is loaded here, in the browser, when it is drawn, with a placeholder of its height until then.
// next/dynamic needs its options written out as an object literal, so each call spells them out.
export const ForecastChart = dynamic(() => import('@/components/cash-forecast-chart').then(module => module.ForecastChart), { ssr: false, loading: () => <ChartSkeleton height={chartHeight.regular}/> });
export const SpendingPaceChart = dynamic(() => import('@/components/spending-pace-chart').then(module => module.SpendingPaceChart), { ssr: false, loading: () => <ChartSkeleton height={chartHeight.compact}/> });
export const IncomeHistoryChart = dynamic(() => import('@/components/income-history-chart').then(module => module.IncomeHistoryChart), { ssr: false, loading: () => <ChartSkeleton/> });
export const InvestmentValueChart = dynamic(() => import('@/components/investment-value-chart').then(module => module.InvestmentValueChart), { ssr: false, loading: () => <ChartSkeleton/> });

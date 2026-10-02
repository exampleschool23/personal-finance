"use client";
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { useLanguage } from '@/components/language-provider';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { marketEntry } from '@/lib/market';
import { useWorkspace } from '@/components/workspace/workspace-provider';

/** Warnings that qualify the totals on a screen: excluded currencies, stale prices and plans that failed to load. */
export function ScreenNotices({ planErrors = true }: { planErrors?: boolean }) {
 const { t } = useLanguage();
 const { demo, rows, summary, currency, market, marketError, expensePlans, budget, error, refreshRecords } = useWorkspace();
 return <>
  {(demo ? rows : summary).some(r => marketEntry(r, currency, market) === null) && <p className="muted">{t('Some currencies could not be converted and are excluded from totals.')}</p>}
  {marketError && <p role="status" className="muted">{t(marketError)}</p>}
  {planErrors && expensePlans.error && <InlineError message={t(expensePlans.error)} onRetry={refreshRecords}/>}
  {budget.missingCurrencies.length > 0 && <p className="muted">{t('Some expense plans could not be converted and are excluded from the forecast.')}</p>}
  <ErrorPopup message={error}/>
 </>;
}

/** Planning data failed to load: say so and offer a retry. */
export function PlanningError() {
 const { t } = useLanguage();
 const { planning, refreshRecords } = useWorkspace();
 return planning.error ? <InlineError as="div" message={t(planning.error)} onRetry={refreshRecords}/> : null;
}

/** Estimates on this screen depend on tools that failed to load. */
export function ToolsUnavailable() {
 const { t } = useLanguage();
 const { refreshRecords } = useWorkspace();
 return <div className="content"><InlineError message={t('Daily finance tools could not load. Refresh before relying on their estimates.')} onRetry={refreshRecords}/></div>;
}

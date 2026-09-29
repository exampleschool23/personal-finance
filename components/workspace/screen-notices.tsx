"use client";
import { ErrorPopup } from '@/components/error-popup';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { marketEntry } from '@/lib/market';
import { useWorkspace } from '@/components/workspace/workspace-provider';

/** Reminds the visitor that a sample workspace saves nothing. */
export function DemoBanner() {
 const { t } = useLanguage();
 const { demo } = useWorkspace();
 return demo ? <div className="demo-banner"><span>{t("DEMO MODE")}</span> {t("Sample balances · Changes are not saved to an account.")}</div> : null;
}

/** Warnings that qualify the totals on a screen: excluded currencies, stale prices and plans that failed to load. */
export function ScreenNotices({ planErrors = true }: { planErrors?: boolean }) {
 const { t } = useLanguage();
 const { demo, rows, summary, currency, market, marketError, expensePlans, budget, error, refreshRecords } = useWorkspace();
 return <>
  {(demo ? rows : summary).some(r => marketEntry(r, currency, market) === null) && <p className="muted">{t('Some currencies could not be converted and are excluded from totals.')}</p>}
  {marketError && <p role="status" className="muted">{t(marketError)}</p>}
  {planErrors && expensePlans.error && <p role="alert" className="error">{t(expensePlans.error)} <Button variant="outline" onClick={refreshRecords}>{t('Retry')}</Button></p>}
  {budget.missingCurrencies.length > 0 && <p className="muted">{t('Some expense plans could not be converted and are excluded from the forecast.')}</p>}
  <ErrorPopup message={error}/>
 </>;
}

/** Planning data failed to load: say so and offer a retry. */
export function PlanningError() {
 const { t } = useLanguage();
 const { planning, refreshRecords } = useWorkspace();
 return planning.error ? <div className="error" role="alert">{t(planning.error)} <Button onClick={refreshRecords}>{t('Retry')}</Button></div> : null;
}

/** Estimates on this screen depend on tools that failed to load. */
export function ToolsUnavailable() {
 const { t } = useLanguage();
 const { refreshRecords } = useWorkspace();
 return <div className="content"><p className="error" role="alert">{t('Daily finance tools could not load. Refresh before relying on their estimates.')} <Button onClick={refreshRecords}>{t('Retry')}</Button></p></div>;
}

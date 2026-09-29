"use client";
import { ErrorPopup } from '@/components/error-popup';
import { IncomeSourceEditor } from '@/components/income-sources-panel';
import { InvestmentTracker } from '@/components/investment-tracker';
import { useLanguage } from '@/components/language-provider';
import { MortgagePaymentDialog } from '@/components/mortgage-payment-dialog';
import { RecordDialog } from '@/components/record-dialog';
import { StopScheduleDialog } from '@/components/stop-schedule-dialog';
import { TransactionDetailsDialog } from '@/components/transaction-details-dialog';
import { SplitTransactionDialog } from '@/components/transaction-tools-panel';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { income } from '@/lib/finance';
import { useWorkspace } from '@/components/workspace/workspace-provider';

/** Dialogs any screen can open: record editing, trackers, payments, splitting and deletion. */
export function WorkspaceDialogs() {
 const { t } = useLanguage();
 const { viewing, setViewing, splitting, setSplitting, editingIncomeSource, setEditingIncomeSource, editing, setEditing, debtPayment, setDebtPayment, tracking, setTracking, payingMortgage, setPayingMortgage, deleting, stopping, setStopping,
  planning, availableBusinesses, transactionTools, preferencesData, earningSources, expensePlans, rows, summary, section, demo, busy, error,
  editRecord, storedRecord, closeEditing, closeDeleting, navigate, refreshRecords, recordMortgagePayment, save, remove, stopRecord, field, money, editingCashFlow, recordKinds, linkedExpensePlan, fetchingPrice, fetchPrice, priceMessage } = useWorkspace();
 return <>
 {viewing&&<TransactionDetailsDialog key={viewing.id} record={viewing} incoming={income.includes(viewing.kind)} categoryName={planning.data.categories.find(c=>c.id===viewing.custom_category_id)?.name} businessName={viewing.business_id?availableBusinesses.find(b=>b.id===viewing.business_id)?.name:undefined} accountName={viewing.account_id?planning.data.records.find(a=>a.id===viewing.account_id)?.name:undefined} editable={!viewing.movement_id&&!viewing.operation_id&&!viewing.mortgage_payment_id&&!viewing.history_event_id} onEdit={()=>{const r=viewing;setViewing(null);editRecord(r);}} onClose={()=>setViewing(null)}/>}
 {splitting&&<SplitTransactionDialog key={splitting.id} record={splitting} tools={transactionTools} categories={planning.data.categories} onClose={()=>setSplitting(null)}/>}
 {editingIncomeSource&&<IncomeSourceEditor key={editingIncomeSource.id} initial={editingIncomeSource} currencies={preferencesData.currencies} records={planning.data.records} save={earningSources.save} close={()=>setEditingIncomeSource(null)}/>}
 <RecordDialog navigate={navigate} onDebtSaved={refreshRecords} onMortgageSave={recordMortgagePayment} onDebtPayment={record=>{setEditing(null);if(record.kind==='Mortgage')setPayingMortgage(record);else setDebtPayment(record);}} earningSources={earningSources} currencies={preferencesData.currencies} key={editing?.id??'closed'} accountMode={section==='Accounts'&&!!editing&&['Cash','Deposit','Stock','Crypto'].includes(editing.kind)} editing={editing} setEditing={update=>{if(update===null)closeEditing();else setEditing(update);}} busy={busy} rows={planning.data.records.length ? planning.data.records : rows} save={save} editingCashFlow={editingCashFlow} recordKinds={recordKinds} demo={demo} summary={summary} field={field} linkedExpensePlan={linkedExpensePlan} availableBusinesses={availableBusinesses} expensePlans={expensePlans} money={money} fetchingPrice={fetchingPrice} fetchPrice={fetchPrice} priceMessage={priceMessage} error={error} planning={planning}/>
 {debtPayment&&<InvestmentTracker key={debtPayment.id} initialType="withdrawal" record={debtPayment} accounts={planning.data.records} accountsReady={!planning.loading&&!planning.refreshing&&!planning.error} onClose={()=>setDebtPayment(null)} onSaved={refreshRecords} onPayment={()=>{}}/>}
 {tracking && <InvestmentTracker key={tracking.id} record={tracking} accounts={planning.data.records} accountsReady={!planning.loading&&!planning.refreshing&&!planning.error} onClose={() => setTracking(null)} onSaved={refreshRecords} onPayment={() => { setPayingMortgage(storedRecord(tracking)); setTracking(null); }}/>}
 {payingMortgage && <MortgagePaymentDialog key={payingMortgage.id} mortgage={payingMortgage} accounts={planning.data.records} onClose={() => setPayingMortgage(null)} onSave={recordMortgagePayment}/>}
 <AlertDialog open={!!deleting} onOpenChange={o => { if (!o && !busy) closeDeleting(); }}><AlertDialogContent><AlertDialogTitle>{t("Delete this record?")}</AlertDialogTitle><AlertDialogDescription>{t('Move {name} to Recently deleted? It will be removed from your records, totals and all planning months. Separate transactions stay unchanged. You can restore it from Recently deleted.',{name:deleting?.name||''})}{deleting?.frequency!=='Once'&&<span className="block">{t('To keep past planning and only end future repeats, choose Stop instead.')}</span>}</AlertDialogDescription><ErrorPopup message={error}/><AlertDialogFooter><AlertDialogCancel disabled={busy}>{t("Keep record")}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void remove(); }}>{t("Delete record")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 {stopping&&<StopScheduleDialog name={stopping.name} start={stopping.date} onSave={stopRecord} onClose={()=>setStopping(null)}/>}
 </>;
}

"use client";
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { CashInvestmentOption } from '@/components/cash-investment-option';
import { CurrencySelect } from '@/components/presentation-foundation/currency-select';
import { CurrencyValue } from '@/components/presentation-foundation/currency-value';
import { CashAccountField } from '@/components/cash-account-field';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { InstrumentPicker } from '@/components/instrument-picker';
import { RecordIcon } from '@/components/presentation-foundation/record-icon';
import { RecordNameInput } from '@/components/record-name-input';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { FormattedNumberInput } from '@/components/presentation-foundation/formatted-number-input';
import { useLanguage } from '@/components/language-provider';
import { instrumentFor } from '@/lib/market';
import { holdingAccountLabel } from '@/lib/holding-accounts';
import { lendingRecordKinds, interestKinds, liabilities, income, value, simpleInterestKinds, unitPricedKinds, valuedKinds, type Entry } from '@/lib/finance';
import { MetalFields } from './metal-fields';
import { LentFromField } from './lent-from-field';
import { depositToday as today } from '@/lib/deposit-interest';
import { changeRecordKind } from '@/lib/record-kind';
import { isBusinessAccount, withAccount } from '@/lib/business';
import { accountOwnerChange, sharedWorkspace, type HouseholdState } from '@/lib/household';
import { BusinessProfileFields } from '@/components/business-profile-fields';

/** What every section of the record form reads: the dialog's props with the record being edited, and what the dialog
 * worked out about it (saved before, an asset, a debt) and how to leave it. */
export type FormContext=Omit<RecordDialogProps,'editing'>&{editing:Entry;existing:boolean;assetRecord:boolean;liability:boolean;formatDate:(date:string)=>string;onCancel:()=>void};
// A transaction moved to another account takes that account's business and, in a household, its owner.
export const withAccountAndOwner=(entry:Entry,accountId:string|null,records:Entry[],household?:HouseholdState|null):Entry=>({...withAccount(entry,accountId,records),...(household&&sharedWorkspace(household)?accountOwnerChange(entry,accountId,records,household):{})});

/** What the record is called: its name, or for stocks and crypto the instrument; a new cash balance can be an investment. */
function IdentityFields({form}:{form:FormContext}){
 const {t}=useLanguage();
 const {editing,setEditing,busy,rows,editingCashFlow,demo,summary,field,existing}=form;
 return <>{editing.kind==='Cash'&&!existing&&<CashInvestmentOption record={editing} disabled={busy} onChange={existing?undefined:enabled=>setEditing({...editing,is_investment:enabled})}/>}{editing.kind === 'Crypto'||editing.kind === 'Stock'||editing.kind === 'Equity compensation' ? <InstrumentPicker key={editing.id+editing.kind} kind={editing.kind === 'Crypto' ? 'Crypto' : 'Stock'} value={editing.name} disabled={busy} onChange={name=>setEditing({...editing,name,amount:instrumentFor({...editing,name})?.symbol===instrumentFor(editing)?.symbol?editing.amount:0})}/> : <RecordNameInput label={editing.kind === 'Money lent' ? t("Borrower name") : undefined} entry={editing} original={rows.find(r => r.id === editing.id)} rows={demo ? rows : summary} onChange={name => field('name', name)} placeholder={t(namePlaceholder(editing.kind, editingCashFlow))}/>}</>;
}
/** The example name a new record's field shows, by kind; income and expense plans have their own. */
const namePlaceholders: Record<string, string> = {
 'Rent income': 'e.g. Apartment rent', 'Business income': 'e.g. Monthly business payout', Salary: 'e.g. Monthly salary', 'Other income': 'e.g. Monthly salary',
 'Money lent': 'e.g. Full name', Business: 'e.g. Solar panels, café, or game club', Property: 'e.g. Apartment or land', Valuables: 'e.g. Watch, jewellery or art',
 Vehicle: 'e.g. Family car or motorbike', 'Retirement account': 'e.g. Pension, 401(k) or IRA', Bond: 'e.g. 10-year government bond', 'Precious metals': 'e.g. Gold bars or coins',
 Mortgage: 'e.g. Apartment mortgage', Loan: 'e.g. Car loan or credit card', Debt: 'e.g. Car loan or credit card',
};
const namePlaceholder = (kind: string, cashFlow: boolean) => cashFlow && !income.includes(kind) ? 'e.g. Rent or internet subscription' : namePlaceholders[kind] ?? 'e.g. Savings account';
/** The kind of record and its currency. */
function KindFields({form}:{form:FormContext}){
 const {t}=useLanguage();
 const {currencies,accountMode,editing,setEditing,busy,rows,recordKinds,existing,assetRecord}=form;
 return <><div className="form-grid"><label>{t(accountMode?(unitPricedKinds.includes(editing.kind)?"Holding type":"Account type"):"Category")}<NativeSelect leadingIcon={<RecordIcon record={editing} />} value={editing.kind} onChange={e => setEditing(changeRecordKind(editing, e.target.value as Entry['kind'], today()))}>{recordKinds.map(k => <option key={k} value={k}>{t(accountMode&&k==='Deposit'?'Interest-bearing deposit':k)}</option>)}</NativeSelect></label>{(income.includes(editing.kind)||(!existing&&(assetRecord||lendingRecordKinds.includes(editing.kind))))?<CurrencySelect value={editing.currency} currencies={currencies} savedCurrency={rows.find(row=>row.id===editing.id)?.currency} disabled={busy} onChange={currency=>setEditing({...editing,currency,...(editing.lent_from?{lent_from:null}:{}),account_exchange_rate:null,account_rate_date:null,account_currency:null})}/>:<CurrencyValue currency={editing.currency}/>}</div></>;
}
/** What it belongs to: an investment account, a business, and the hints for accounts and businesses. */
function LinkFields({form}:{form:FormContext}){
 const {t}=useLanguage();
 const {accountMode,editing,setEditing,busy,editingCashFlow,availableBusinesses,planning}=form;
 return <>{['Cash','Stock','Crypto'].includes(editing.kind)&&<label>{t('Investment account (optional)')}<NativeSelect disabled={busy||planning.loading||!!planning.error} value={editing.holding_account_id??''} onChange={event=>setEditing({...editing,holding_account_id:event.target.value||null})}><option value="">{t('No investment account')}</option>{(planning.data.holdingAccounts??[]).filter(account=>editing.kind==='Cash'||account.kind===editing.kind).map(account=><option key={account.id} value={account.id}>{account.name} · {t(holdingAccountLabel(account.kind))}</option>)}</NativeSelect><small className="muted">{t(editing.kind==='Cash'?'Link only cash held at a broker or crypto exchange. Leave unlinked for a bank account or wallet.':'Choose the account that holds this investment, or leave it unlinked.')}</small></label>}{accountMode&&editing.kind==='Cash'&&<p className="muted">{t('For an interest-bearing balance, choose Deposit and enter its annual interest rate.')}</p>}{editingCashFlow && !editing.expense_plan_id && <label>{t(editing.kind==='Business income'?'Business':'Linked business (optional)')}<NativeSelect required={editing.kind==='Business income'} disabled={busy} value={editing.business_id || ''} onChange={event => setEditing({ ...editing, business_id: event.target.value || null })}><option value="">{t(editing.kind==='Business income'?'Choose a business':'No linked business')}</option>{availableBusinesses.map(business => <option key={business.id} value={business.id}>{business.name}</option>)}</NativeSelect></label>}{editing.kind === 'Business' && <p className="muted">{t('Enter the full business value and your ownership percentage. Record your share of revenue and costs separately as linked income and expenses.')}</p>}{editing.kind === 'Business' && <BusinessProfileFields value={editing} disabled={busy} onChange={patch => setEditing({ ...editing, ...patch })}/>}{isBusinessAccount(editing) && availableBusinesses.length > 0 && <label>{t('Business (optional)')}<NativeSelect disabled={busy} value={editing.business_id ?? ''} onChange={event => setEditing({ ...editing, business_id: event.target.value || null })}><option value="">{t('Household')}</option>{availableBusinesses.map(business => <option key={business.id} value={business.id}>{business.name}</option>)}</NativeSelect><small className="muted">{t('Its transactions count toward this business unless you assign them elsewhere.')}</small></label>}</>;
}
/** How much it is worth: the amount, the estimates a mortgage, property or business plans with, and ownership. */
function AmountFields({form}:{form:FormContext}){
 const {t}=useLanguage();
 const {editing,editingCashFlow,field,money,existing}=form;
 return <><label className="record-amount">{unitPricedKinds.includes(editing.kind) ? t("Current price per unit") : editingCashFlow ? t("Amount per occurrence") : editing.kind === 'Money lent' ? t("Amount still owed") : editing.kind === 'Business' ? t("Full business value") : ['Cash','Deposit'].includes(editing.kind) ? t(existing ? "Current balance" : "Opening balance") : editing.kind === 'Treasury bill' ? t(existing ? "Current value" : "Amount invested") : editing.kind === 'Bond' ? t("Face value") : valuedKinds.includes(editing.kind) ? t("Current value") : t("Amount / outstanding balance")}<FormattedNumberInput key={editing.id + ":amount"} value={editing.amount} max={1e15} onValueChange={value => field('amount', value)}/></label>{editing.kind === 'Mortgage' && <label>{t('Estimated monthly mortgage payment')}<FormattedNumberInput key={editing.id + ':payment-estimate'} value={editing.estimated_monthly_payment ?? 0} required={false} onValueChange={amount => field('estimated_monthly_payment', amount)}/><small className="muted">{t('Enter the expected total from your bank schedule, including principal and interest. Used for planning; recording payments is separate.')}</small></label>}{['Property', 'Business'].includes(editing.kind) && <label>{t('Estimated monthly income (your share)')}<FormattedNumberInput key={editing.id + ':estimate'} value={editing.estimated_monthly_income ?? 0} required={false} max={1e15} onValueChange={amount => field('estimated_monthly_income', amount)}/><small className="muted">{t('A positive estimate creates a monthly income plan. Saving the record date also updates linked fixed-income start dates. Recorded payments stay unchanged.')}</small></label>}{editing.kind === 'Business' && <><label>{t('Ownership (%)')}<FormattedNumberInput key={editing.id + ':ownership'} value={editing.ownership_percentage ?? 100} max={100} onValueChange={percentage => field('ownership_percentage', percentage)}/></label><p className="ownership-summary">{t('Your share: {amount}', { amount: money(value(editing), editing.currency) })}</p></>}</>;
}
/** A holding's current price from the market, its quantity and what it cost. */
function HoldingFields({form}:{form:FormContext}){
 const {t}=useLanguage();
 const {editing,field,fetchingPrice,fetchPrice,priceMessage}=form;
 return <>{unitPricedKinds.includes(editing.kind) && <><Button type="button" variant="outline" disabled={fetchingPrice || !instrumentFor(editing)} onClick={fetchPrice}>{t(fetchingPrice ? 'Fetching prices…' : 'Fetch current price')}</Button>{priceMessage && <p role="status" className="muted">{t(priceMessage)}</p>}</>}{unitPricedKinds.includes(editing.kind) && <div className="form-grid"><label>{t(editing.kind === 'Precious metals' ? "Weight" : editing.kind === 'Equity compensation' ? "Vested units" : "Quantity")}<FormattedNumberInput key={editing.id + ":quantity"} value={editing.quantity} max={1e12} onValueChange={value => field('quantity', value)}/></label><label>{t("Purchase price per unit")}<FormattedNumberInput key={editing.id + ":cost"} value={editing.cost} required={false} max={1e15} onValueChange={value => field('cost', value)}/></label></div>}</>;
}
/** What it earns: the interest rate or yield, how a deposit compounds, and the date an opening balance was held. */
function InterestFields({form}:{form:FormContext}){
 const {t}=useLanguage();
 const {accountMode,editing,setEditing,rows,field}=form;
 return <>{[...interestKinds, 'Money lent', ...liabilities].includes(editing.kind) && <label>{t(editing.kind === 'Treasury bill' ? "Annual yield (%)" : editing.kind === 'Bond' ? "Coupon rate (%)" : "Annual interest rate (%)")}<FormattedNumberInput key={editing.id + ":rate"} value={editing.rate} required={false} max={1000} onValueChange={value => field('rate', value)}/></label>}{editing.kind === 'Deposit' && <label>{t('Interest compounding')}<NativeSelect value={editing.deposit_compounding??'monthly'} onChange={event=>setEditing({...editing,deposit_compounding:event.target.value as Entry['deposit_compounding']})}><option value="monthly">{t('Monthly compounding')}</option><option value="daily">{t('Daily compounding')}</option><option value="none">{t('No compounding')}</option></NativeSelect></label>}{editing.kind === 'Treasury bill' && <p className="muted">{t('Use Treasury bill for a government bill held to maturity. Enter its annual yield; it accrues without compounding until the maturity date.')}</p>}{editing.kind === 'Bond' && <p className="muted">{t('Use Bond for a government or corporate bond. Enter its face value and annual coupon rate; it earns without compounding until the maturity date.')}</p>}{editing.kind === 'Deposit' && <p className="muted">{t('Use Deposit for an interest-bearing savings account. Enter an annual rate. Interest follows dated top-ups, withdrawals and the selected compounding schedule.')}</p>}{accountMode&&editing.kind==='Deposit'&&<p className="muted">{t('To fund this deposit from cash, start with a zero balance. Then use Top-up to transfer from a cash account.')}</p>}{['Cash',...interestKinds,...unitPricedKinds].includes(editing.kind)&&!rows.some(row=>row.id===editing.id)&&<label>{t(simpleInterestKinds.includes(editing.kind)||editing.kind==='Precious metals'?'Purchase date':'Opening balance date')}<DatePicker value={editing.opened_on??today()} onChange={date=>field('opened_on',date)}/><small className="muted">{t('The date this starting balance was held. Enter later transactions in date order.')}</small></label>}</>;
}
/** When: the start of a debt, the day money was lent, the due or maturity date, and whether a cash flow repeats. */
function DateFields({form}:{form:FormContext}){
 const {t}=useLanguage();
 const {editing,setEditing,editingCashFlow,field,existing,liability,formatDate}=form;
 return <><div className="form-grid">{liability&&(existing?<div><span>{t('Start date')}</span><p>{formatDate(editing.opened_on||'')}</p><small className="muted">{t('The start date is fixed once the record is saved to preserve its history.')}</small></div>:<label>{t('Start date')}<DatePicker value={editing.opened_on??today()} max={editing.date&&editing.date<today()?editing.date:today()} onChange={date=>field('opened_on',date)}/><small className="muted">{t('When this debt or loan began. Enter the principal outstanding on that date, then record later repayments in Tracker.')}</small></label>)}{editing.kind === 'Money lent' && <label>{t("Date lent")}<DatePicker value={editing.lent_date || ''} max={editing.lent_from ? today() : undefined} onChange={value => field('lent_date', value)}/></label>}<DueDateField form={form}/>{editingCashFlow && !editing.expense_plan_id && <label>{t("Repeats")}<NativeSelect value={editing.frequency} onChange={e => setEditing({...editing,frequency:e.target.value as Entry['frequency'],account_id:null,end_date:e.target.value==='Once'?null:editing.end_date})}><option value="Once">{t("One time")}</option><option value="Monthly">{t("Every month")}</option><option value="Yearly">{t("Every year")}</option></NativeSelect></label>}</div></>;
}
/** The record's own date: when money lent is due, when a bill or deposit matures, or when a cash flow is recorded or starts. */
function DueDateField({form}:{form:FormContext}){
 const {t}=useLanguage();
 const {editing,editingCashFlow,field,existing,liability,linkedExpensePlan}=form;
 return <><label>{editing.kind === 'Money lent' ? t("Due date (optional)") : simpleInterestKinds.includes(editing.kind) ? t("Maturity date") : editing.kind === 'Equity compensation' ? t("Vesting date") : ['Deposit', ...liabilities].includes(editing.kind) ? t("Due / maturity date") : editingCashFlow && editing.frequency !== 'Once' ? t("Start date") : t("Record date")}<DatePicker value={editing.date} required={editing.kind !== 'Money lent'} min={editing.kind === 'Money lent' ? editing.lent_date || undefined : liability || simpleInterestKinds.includes(editing.kind) ? editing.opened_on??(existing?undefined:today()) : linkedExpensePlan?.start_date} onChange={value => field('date', value)}/></label></>;
}
/** Until when a repeating cash flow runs, and what it means. */
function RecurrenceFields({form}:{form:FormContext}){
 const {t}=useLanguage();
 const {editing,setEditing,editingCashFlow,money,formatDate}=form;
 return <>{editingCashFlow && editing.frequency !== 'Once' && <label>{t("End date (optional)")}<DatePicker value={editing.end_date||''} required={false} min={editing.date} onChange={end_date=>setEditing({...editing,end_date:end_date||null})}/></label>}{editingCashFlow && editing.frequency !== 'Once' && <p className="recurrence-help">{t('{amount} {frequency} from {date}. This is a recurring plan; it does not automatically create transactions or change account balances.', { amount: money(editing.amount, editing.currency), frequency: t(editing.frequency === 'Monthly' ? 'every month' : 'every year'), date: formatDate(editing.date) })}</p>}</>;
}
/** Where income and spending are booked, the notes, and saving. */
function BookingFields({form}:{form:FormContext}){
 const {t}=useLanguage();
 const {household,editing,setEditing,busy,editingCashFlow,demo,field,error,planning,onCancel}=form;
 return <>{editingCashFlow && <><CashAccountField entry={editing} records={planning.data.records} loading={planning.loading} error={planning.error} busy={busy} onChange={account_id=>setEditing(withAccountAndOwner(editing,account_id,planning.data.records,household))}/><label>{t('Category')}<NativeSelect value={editing.custom_category_id||''} onChange={e=>setEditing({...editing,custom_category_id:e.target.value||null})}><option value="">{t('None')}</option>{planning.data.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></label></>}<label>{t("Notes (optional)")}<textarea value={editing.notes} maxLength={2000} rows={2} placeholder={t("Account, lender, borrower, or other details")} onChange={e => field('notes', e.target.value)}/></label><ErrorPopup message={error}/><div className="record-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{t("Cancel")}</Button><Button className="primary" disabled={busy||(unitPricedKinds.includes(editing.kind)&&!instrumentFor(editing))}>{busy ? t("Saving…") : demo ? t("Save in demo") : t("Save record")}</Button></div></>;
}

/** The form for every record that is not income or an expense: assets, accounts and holdings, debts and money lent. */
export function RecordForm({form}:{form:FormContext}){
 return <form className="record-form" onSubmit={form.save}><IdentityFields form={form}/><KindFields form={form}/>{form.editing.kind === 'Precious metals' && <MetalFields editing={form.editing} setEditing={form.setEditing} disabled={form.busy}/>}<LinkFields form={form}/><AmountFields form={form}/>{form.editing.kind === 'Money lent' && !form.existing && <LentFromField entry={form.editing} records={form.planning.data.records} loading={form.planning.loading} error={form.planning.error} busy={form.busy} onChange={lent_from => form.setEditing({ ...form.editing, lent_from })}/>}<HoldingFields form={form}/><InterestFields form={form}/><DateFields form={form}/><RecurrenceFields form={form}/><BookingFields form={form}/></form>;
}
import type { RecordDialogProps } from '../record-dialog';

// The shapes the Telegram button conversation passes around: the draft being answered, the owner's data it reads,
// and what a finished conversation saves.
import type {Entry} from '../finance';
import type {Language} from '../i18n';
import type {Category} from '../planning';
import type {RecordInput} from '../record-schema';
import type {TelegramMessage} from '../telegram';
import type {TransactionRule} from '../transaction-rules';

export type FlowKind='expense'|'income'|'transfer'|'repayment'|'mortgage'|'account'|'liability';
export type Step='category'|'account'|'target'|'amount'|'received'|'interest'|'name'|'date'|'confirm'|'accname'|'currency'|'balance'|'lkind'|'lname'|'duedate'|'rate'|'payment'|'business'|'schedule'|'fxamount'|'fxrate';
/** `typed` marks an entry read from a typed message: its questions return to the confirmation card. `fx_rate` is how many
 * units of the record's currency one unit of the account's currency buys, as `account_exchange_rate` stores it. */
export type DraftData={typed?:boolean;fx_rate?:number;fx_rate_date?:string;id?:string;business_id?:string|null;/** The schedule this payment belongs to, by id; null when it is not a scheduled payment. */schedule_id?:string|null;category?:string;custom_category_id?:string|null;category_name?:string;account_id?:string;target_id?:string;amount?:number;received?:number;interest?:number;name?:string;date?:string;account_name?:string;currency?:string;lkind?:LiabilityKind;rate?:number;payment?:number;resume?:Draft};
export type LiabilityKind='Loan'|'Debt'|'Mortgage';
export const liabilityKinds:LiabilityKind[]=['Loan','Debt','Mortgage'];
export type Draft={kind:FlowKind;step:Step;data:DraftData};
export type FlowContext={language:Language;today:string;newId:string;categories:Category[];accounts:Entry[];liabilities:Entry[];currencies?:string[];businesses?:Entry[];records?:Entry[];rules?:TransactionRule[];/** Built-in categories the workspace deleted: never offered or guessed. */removed?:string[]};
export type FlowInput={text?:string;callback?:string};
export type PaymentData={id:string;account_id:string;target_id:string;amount:number;received:number;fee:number;date:string;notes:string};
/** What to save. A record in another currency than its account carries the dated rate's day and the account currency in `fx`;
 * a loan or mortgage payment from an account in another currency is an `fxpayment` with its rate. */
export type Commit={type:'record';record:RecordInput;resume?:Draft;fx?:{account_rate_date:string;account_currency:string}}|{type:'planning';action:'transfer'|'repayment'|'mortgage';data:PaymentData}|{type:'fxpayment';action:'repayment'|'mortgage';data:PaymentData;rate:number;rate_date:string;account_currency:string;record_currency:string};
export type FlowResult={draft:Draft|null;reply:TelegramMessage|null;commit?:Commit;menu?:'upcoming'};

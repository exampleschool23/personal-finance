import { z } from 'zod';
import { isCurrency } from './currencies';
import type { Entry } from './finance';
import { salaryDueDate } from './income-sources';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value);
export const earningSourceSchema=z.object({
 id:z.string().uuid(),name:z.string().trim().min(1).max(120),kind:z.enum(['Salary','Rent income','Business income','Other income']),
 currency:z.string().refine(isCurrency),mode:z.enum(['fixed','variable']),archived:z.boolean().default(false),
 amount:z.number().finite().nonnegative().max(1e15).nullable(),recurrence_days:z.number().int().min(1).max(366).nullable().optional(),frequency:z.enum(['Weekly','Fortnightly','Monthly','Yearly','Custom']).nullable(),start_date:date.nullable(),end_date:date.nullable(),
 linked_record_id:z.string().uuid().nullable().default(null),
}).superRefine((source,ctx)=>{
 if((source.frequency==='Custom')!==(source.recurrence_days!=null))ctx.addIssue({code:'custom',message:'Check the schedule interval.'});
 if(source.mode==='fixed'&&(!source.amount||!source.frequency||!source.start_date||(source.end_date&&source.end_date<source.start_date)))ctx.addIssue({code:'custom',message:'Set an amount and schedule for fixed income.'});
 if(source.mode==='variable'&&[source.amount,source.frequency,source.start_date,source.end_date].some(value=>value!==null))ctx.addIssue({code:'custom',message:'Variable income has no fixed amount or schedule.'});
 if(['Business income','Rent income'].includes(source.kind)&&!source.linked_record_id)ctx.addIssue({code:'custom',message:'Choose a matching income source.'});
 if(!['Business income','Rent income'].includes(source.kind)&&source.linked_record_id)ctx.addIssue({code:'custom',message:'Choose a matching income source.'});
});
export type EarningSource=z.infer<typeof earningSourceSchema>&{schedule_id?:string|null};
export function sourceSchedule(source:EarningSource):Entry|null{
 if(source.mode!=='fixed'||source.archived)return null;
 return {id:source.schedule_id??source.id,name:source.name,kind:source.kind,currency:source.currency,amount:source.amount!,date:source.start_date!,recurrence_days:source.recurrence_days,frequency:source.frequency!,end_date:source.end_date,quantity:1,cost:0,rate:0,notes:'',business_id:source.kind==='Business income'?source.linked_record_id:null,income_source_id:source.kind==='Rent income'?source.linked_record_id:null};
}
export function selectEarningSource(entry:Entry,source:EarningSource,bonus=false):Partial<Entry>{
 return {earning_source_id:source.id,payment_type:bonus?'bonus':'regular',name:source.name,kind:bonus?'Other income':source.kind,frequency:'Once',recurrence_days:null,end_date:null,business_id:!bonus&&source.kind==='Business income'?source.linked_record_id:null,income_source_id:null,income_due_on:null,earning_due_on:source.mode==='fixed'&&!bonus?salaryDueDate({date:source.start_date!,recurrence_days:source.recurrence_days,frequency:source.frequency!},entry.date):null};
}
export function resolveEarningSource(entry:Entry,sources:EarningSource[],original?:Entry):Partial<Entry>{
 const source=sources.find(item=>item.id===entry.earning_source_id);
 if(!source||(source.archived&&original?.earning_source_id!==source.id))throw Error('Choose an active income source.');
 if(entry.frequency!=='Once')throw Error('Source payments must be one-time income.');
 const patch=selectEarningSource(entry,source,entry.payment_type==='bonus');
 if(patch.earning_due_on){
  const due=entry.earning_due_on??patch.earning_due_on;
  if(due<source.start_date!||(source.end_date&&due>source.end_date)||salaryDueDate({date:source.start_date!,recurrence_days:source.recurrence_days,frequency:source.frequency!},due)!==due)throw Error('Choose a scheduled payment date.');
  patch.earning_due_on=due;
 }else if(entry.earning_due_on)throw Error('Variable income and bonuses have no scheduled due date.');
 return patch;
}

export function legacyEarningSources(records:Entry[]):EarningSource[]{
 return records.filter(row=>!row.source_paused&&row.frequency!=='Once'&&row.amount>0&&(row.kind==='Salary'||row.kind==='Other income'||(row.kind==='Business income'&&row.business_id)||(row.kind==='Rent income'&&row.income_source_id))).map(row=>({id:row.id,schedule_id:row.id,name:row.name,kind:row.kind as EarningSource['kind'],currency:row.currency,mode:'fixed',archived:false,amount:row.amount,recurrence_days:row.recurrence_days,frequency:row.frequency as EarningSource['frequency'],start_date:row.date,end_date:row.end_date??null,linked_record_id:row.kind==='Business income'?row.business_id!:row.kind==='Rent income'?row.income_source_id!:null}));
}

// Demo equivalent of the atomic asset-plan trigger. The schedule is reused on later edits.
export function withAssetIncomePlans(records:Entry[],sources:EarningSource[]=[]):Entry[]{
 const additions:Entry[]=[];
 for(const asset of records){
  if(!['Property','Business'].includes(asset.kind)||!(Number(asset.estimated_monthly_income)>0))continue;
  if(sources.some(source=>source.linked_record_id===asset.id)||records.some(row=>row.frequency!=='Once'&&(asset.kind==='Business'?row.kind==='Business income'&&row.business_id===asset.id:row.kind==='Rent income'&&row.income_source_id===asset.id)))continue;
  additions.push({...asset,id:crypto.randomUUID(),kind:asset.kind==='Business'?'Business income':'Rent income',amount:asset.estimated_monthly_income!,frequency:'Monthly',estimated_monthly_income:0,ownership_percentage:100,quantity:1,cost:0,rate:0,business_id:asset.kind==='Business'?asset.id:null,income_source_id:asset.kind==='Property'?asset.id:null,notes:''});
 }
 return additions.length?[...records,...additions]:records;
}

export function earningSourcePaymentStatus(source:EarningSource,date:string,occurrences:readonly {record_id:string;due_on:string;status:string}[]){
 if(source.mode!=='fixed'||!source.start_date||!source.frequency)return null;
 const due=salaryDueDate({date:source.start_date,recurrence_days:source.recurrence_days,frequency:source.frequency},date);
 if(due<source.start_date||(source.end_date&&due>source.end_date))return null;
 return {due,paid:!!source.schedule_id&&occurrences.some(item=>item.record_id===source.schedule_id&&item.due_on===due&&item.status==='paid')};
}

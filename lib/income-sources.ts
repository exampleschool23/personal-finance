import {scheduleDueDate,type Entry} from './finance';

export function incomeSources(kind: Entry['kind'], records: Entry[], currentId: string) {
 return records.filter(record=>record.id!==currentId && !record.source_paused && (kind==='Business income'?record.kind==='Business':kind==='Rent income'?record.kind==='Property':kind==='Salary'?record.kind==='Salary'&&record.frequency!=='Once'&&!record.income_source_id:false));
}
export function salaryDueDate(plan:Pick<Entry,'date'|'frequency'|'recurrence_days'>,receivedOn:string):string { return scheduleDueDate(plan,receivedOn); }
export function selectIncomeSource(entry: Entry, source: Entry): Partial<Entry> {
 if(!incomeSources(entry.kind,[source],entry.id).length)throw Error('Choose a matching income source.');
 return {name:source.name,business_id:entry.kind==='Business income'?source.id:entry.kind==='Salary'?source.business_id??null:null,income_source_id:entry.kind==='Business income'?null:source.id,...(entry.kind==='Salary'?{frequency:'Once' as const,recurrence_days:null,end_date:null,income_due_on:salaryDueDate(source,entry.date)}:{})};
}
export function changeIncomeKind(entry:Entry,kind:Entry['kind']):Entry {
 return {...entry,kind,name:'',business_id:null,income_source_id:null,income_due_on:null,frequency:'Once',recurrence_days:null,end_date:null};
}

export function resolveIncomeSource(entry:Entry,records:Entry[]):Partial<Entry> {
 const source=incomeSources(entry.kind,records,entry.id).find(row=>row.id===entry.income_source_id);
 if(!source)throw Error('Choose a matching income source.');
 const patch=selectIncomeSource(entry,source);
 if(entry.kind==='Salary'){
  const due=entry.income_due_on??patch.income_due_on!;
  if(entry.frequency!=='Once'||due<source.date||(source.end_date&&due>source.end_date)||salaryDueDate(source,due)!==due)throw Error('Choose a scheduled salary date.');
  patch.income_due_on=due;
 }
 return patch;
}

import type {Entry} from './finance';
export type RecordEdit={id:string;changed_at:string;before_record:Entry;after_record:Entry|null};
export const recordChangeFields={name:'Name',kind:'Category',currency:'Currency',amount:'Amount',quantity:'Quantity',cost:'Purchase cost',rate:'Interest rate',date:'Date',lent_date:'Date lent',end_date:'End date (optional)',notes:'Notes',frequency:'Repeats',ownership_percentage:'Ownership',estimated_monthly_income:'Estimated monthly income',estimated_monthly_payment:'Monthly payment'} as const;
export function recordChanges(edit:RecordEdit){
 return (Object.keys(recordChangeFields) as Array<keyof typeof recordChangeFields>).filter(key=>edit.before_record[key]!==edit.after_record?.[key]);
}

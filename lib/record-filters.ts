import { compareRecordDates, matchesRecordDate } from './record-dates';
import type { Entry } from './finance';
export type RecordFiltersValue = {query:string;category:string;from:string;to:string;order:'newest'|'oldest'|'name'};
export const emptyRecordFilters:RecordFiltersValue = {query:'',category:'all',from:'',to:'',order:'newest'};
export function activeFilterCount(filters:RecordFiltersValue) {
 return Number(!!filters.query.trim())+Number(filters.category!=='all')+Number(!!filters.from)+Number(!!filters.to)+Number(filters.order!=='newest');
}
export function changeFilterStart(filters:RecordFiltersValue,from:string):RecordFiltersValue {
 return {...filters,from,to:from&&filters.to&&from>filters.to?'':filters.to};
}
// Money lent is dated by the day it was lent; its due date is optional.
const recordDay=(record:Entry)=>record.kind==='Money lent'?record.lent_date||record.date:record.date;
export function filterRecords(records:Entry[],filters:RecordFiltersValue,locale:string) {
 return records.filter(record=>(!filters.query.trim()||`${record.name} ${record.notes}`.toLocaleLowerCase(locale).includes(filters.query.trim().toLocaleLowerCase(locale)))&&(filters.category==='all'||record.kind===filters.category||record.custom_category_id===filters.category)&&matchesRecordDate(recordDay(record),filters.from,filters.to)).sort((a,b)=>filters.order==='name'?a.name.localeCompare(b.name,locale):compareRecordDates(recordDay(a),recordDay(b),filters.order)||a.id.localeCompare(b.id));
}
// Local filter changes must never change the server request identity.
export function recordsRequestKey(user:string|null,section:string,currency:string,page:number) {
 return `${user}:${section}:${currency}:${page}`;
}

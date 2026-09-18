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
export function filterRecords(records:Entry[],filters:RecordFiltersValue,locale:string) {
 return records.filter(record=>(!filters.query.trim()||`${record.name} ${record.notes}`.toLocaleLowerCase(locale).includes(filters.query.trim().toLocaleLowerCase(locale)))&&(filters.category==='all'||record.kind===filters.category||record.custom_category_id===filters.category)&&matchesRecordDate(record.date,filters.from,filters.to)).sort((a,b)=>filters.order==='name'?a.name.localeCompare(b.name,locale):compareRecordDates(a.date,b.date,filters.order)||a.id.localeCompare(b.id));
}
// Local filter changes must never change the server request identity.
export function recordsRequestKey(user:string|null,section:string,currency:string,page:number) {
 return `${user}:${section}:${currency}:${page}`;
}

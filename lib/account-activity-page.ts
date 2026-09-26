import type { PlanningData } from './planning';
import { compareRecordDates } from './record-dates';

// One page budget across operations, movements and cash-linked receipts.
export function accountActivityPage(data:PlanningData,requestedPage:number){
 const entries=[
  ...data.activity.map(row=>({kind:'activity' as const,date:row.occurred_on,row})),
  ...(data.movements??[]).map(row=>({kind:'movements' as const,date:row.occurred_on,row})),
  ...data.records.filter(row=>row.account_id).map(row=>({kind:'records' as const,date:row.date,row})),
  ...(data.investmentLinks??[]).map(row=>({kind:'investmentLinks' as const,date:row.investment_history.occurred_on,row})),
 ].sort((a,b)=>compareRecordDates(a.date,b.date)||a.kind.localeCompare(b.kind)||a.row.id.localeCompare(b.row.id));
 const pages=Math.max(1,Math.ceil(entries.length/10));
 const page=Math.min(pages,Math.max(1,Number.isFinite(requestedPage)?Math.floor(requestedPage):1));
 const visible=entries.slice((page-1)*10,page*10);
 return {page,pages,total:entries.length,
  activity:visible.filter(item=>item.kind==='activity').map(item=>item.row),
  movements:visible.filter(item=>item.kind==='movements').map(item=>item.row),
  records:visible.filter(item=>item.kind==='records').map(item=>item.row),
  investmentLinks:visible.filter(item=>item.kind==='investmentLinks').map(item=>item.row),
 };
}

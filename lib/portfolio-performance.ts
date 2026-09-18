export type DatedCash={date:string;amount:number};
const time=(date:string)=>Date.parse(date+'T00:00:00Z');
const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(time(date))&&new Date(time(date)).toISOString().slice(0,10)===date;
/** Investor-perspective cashflows: investments negative, proceeds positive.
 * Fail closed for non-conventional signs, which can have multiple IRRs. */
export function xirr(flows:DatedCash[]):number|null{
 const grouped=new Map<string,number>();for(const flow of flows){if(!Number.isFinite(flow.amount)||!validDate(flow.date))return null;grouped.set(flow.date,(grouped.get(flow.date)??0)+flow.amount);}
 const rows=[...grouped].filter(([,amount])=>amount!==0).sort(([a],[b])=>a.localeCompare(b));if(rows.length<2||rows[0][1]>=0||rows.at(-1)![1]<=0)return null;
 let positive=false;for(const [,amount] of rows){if(amount>0)positive=true;else if(positive)return null;}
 const origin=time(rows[0][0]),scale=Math.max(...rows.map(([,n])=>Math.abs(n)));if(time(rows.at(-1)![0])<=origin)return null;
 const npv=(logRate:number)=>rows.reduce((sum,[date,amount])=>sum+amount/scale*Math.exp(-logRate*(time(date)-origin)/(365.25*86400000)),0);
 let low=-20,high=20;const a=npv(low),b=npv(high);if(!Number.isFinite(a)||!Number.isFinite(b)||a*b>0)return null;
 for(let i=0;i<160;i++){const mid=(low+high)/2;if(npv(mid)>0)low=mid;else high=mid;}
 const result=Math.expm1((low+high)/2);return Number.isFinite(result)?result:null;
}
/** Daily estimate, treating external cash movements as occurring at period end.
 * Exact TWR needs valuations at every external flow. Do not hide that distinction. */
export function timeWeightedEstimate(points:{date:string;amount:number|null}[],flows:DatedCash[]){
 if(points.length<2||points.some(p=>!validDate(p.date))||flows.some(f=>!validDate(f.date)||!Number.isFinite(f.amount)))return null;
 let factor=1,peak=1,drawdown=0;
 for(let i=1;i<points.length;i++){const before=points[i-1].amount,after=points[i].amount;if(before===null||after===null||!Number.isFinite(before)||!Number.isFinite(after)||before<=0||time(points[i].date)<=time(points[i-1].date))return null;const flow=flows.filter(f=>f.date>points[i-1].date&&f.date<=points[i].date).reduce((sum,f)=>sum+f.amount,0);const change=(after-flow)/before;if(change<0||!Number.isFinite(change))return null;factor*=change;peak=Math.max(peak,factor);drawdown=Math.max(drawdown,1-factor/peak);}
 const years=(time(points.at(-1)!.date)-time(points[0].date))/(365.25*86400000);return {total:factor-1,annualized:years>0?Math.pow(factor,1/years)-1:null,drawdown};
}
export function allocationDrift(values:Record<string,number|null>,weights:Record<string,number>,newCash=0){
 if(!Number.isFinite(newCash)||newCash<0||Math.abs(Object.values(weights).reduce((sum,n)=>sum+n,0)-100)>1e-8||Object.values(weights).some(n=>!Number.isFinite(n)||n<0)||Object.values(values).some(n=>n===null||!Number.isFinite(n)||n<0))return null;
 const total=Object.values(values).reduce<number>((sum,n)=>sum+n!,0);if(total<=0&&newCash===0)return null;
 const rows=[...new Set([...Object.keys(values),...Object.keys(weights)])].map(key=>{const value=values[key]??0,target=weights[key]??0;return {key,value,actual:total?value/total*100:0,target,delta:(total+newCash)*target/100-value};});
 const gaps=rows.reduce((sum,row)=>sum+Math.max(0,row.delta),0);return {total,rows:rows.map(row=>({...row,contribution:gaps?newCash*Math.max(0,row.delta)/gaps:0}))};
}

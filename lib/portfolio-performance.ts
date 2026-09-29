export function allocationDrift(values:Record<string,number|null>,weights:Record<string,number>,newCash=0){
 if(!Number.isFinite(newCash)||newCash<0||Math.abs(Object.values(weights).reduce((sum,n)=>sum+n,0)-100)>1e-8||Object.values(weights).some(n=>!Number.isFinite(n)||n<0)||Object.values(values).some(n=>n===null||!Number.isFinite(n)||n<0))return null;
 const total=Object.values(values).reduce<number>((sum,n)=>sum+n!,0);if(total<=0&&newCash===0)return null;
 const rows=[...new Set([...Object.keys(values),...Object.keys(weights)])].map(key=>{const value=values[key]??0,target=weights[key]??0;return {key,value,actual:total?value/total*100:0,target,delta:(total+newCash)*target/100-value};});
 const gaps=rows.reduce((sum,row)=>sum+Math.max(0,row.delta),0);return {total,rows:rows.map(row=>({...row,contribution:gaps?newCash*Math.max(0,row.delta)/gaps:0}))};
}

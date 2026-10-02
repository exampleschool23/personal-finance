export function allocationDrift(values:Record<string,number|null>,weights:Record<string,number>,newCash=0){
 if(!Number.isFinite(newCash)||newCash<0||Math.abs(Object.values(weights).reduce((sum,n)=>sum+n,0)-100)>1e-8||Object.values(weights).some(n=>!Number.isFinite(n)||n<0)||Object.values(values).some(n=>n===null||!Number.isFinite(n)||n<0))return null;
 const total=Object.values(values).reduce<number>((sum,n)=>sum+n!,0);if(total<=0&&newCash===0)return null;
 const rows=[...new Set([...Object.keys(values),...Object.keys(weights)])].map(key=>{const value=values[key]??0,target=weights[key]??0;return {key,value,actual:total?value/total*100:0,target,delta:(total+newCash)*target/100-value};});
 const gaps=rows.reduce((sum,row)=>sum+Math.max(0,row.delta),0);return {total,rows:rows.map(row=>({...row,contribution:gaps?newCash*Math.max(0,row.delta)/gaps:0}))};
}

/** Today's mix as whole-number target weights that add up to exactly 100 (largest remainder), so a first-time
 * target starts from what the person holds instead of an arbitrary split. Null when a value is unknown or nothing is held. */
export function currentAllocationWeights(values:Record<string,number|null>):Record<string,number>|null{
 const entries=Object.entries(values);
 if(entries.some(([,n])=>n===null||!Number.isFinite(n)||n<0))return null;
 const total=entries.reduce((sum,[,n])=>sum+n!,0);if(total<=0)return null;
 const shares=entries.map(([key,n])=>({key,exact:n!/total*100})).map(item=>({...item,whole:Math.floor(item.exact)}));
 let left=100-shares.reduce((sum,item)=>sum+item.whole,0);
 for(const item of [...shares].sort((a,b)=>(b.exact-b.whole)-(a.exact-a.whole))){if(left<=0)break;item.whole++;left--;}
 return Object.fromEntries(shares.filter(item=>item.whole>0).map(item=>[item.key,item.whole]));
}

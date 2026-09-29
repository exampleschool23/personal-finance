// Match PostgreSQL numeric equality without binary floating point tails.
const parts=(value:number)=>{const [mantissa,exponent='0']=String(value).toLowerCase().split('e');const digits=mantissa.replace('-','').split('.');return {integer:BigInt(digits.join(''))*BigInt(mantissa.startsWith('-')?-1:1),scale:(digits[1]?.length??0)-Number(exponent)};};
const aligned=(values:number[])=>{const items=values.map(parts),scale=Math.max(0,...items.map(item=>item.scale));return {scale,integers:items.map(item=>item.integer*BigInt(10)**BigInt(scale-item.scale))};};
export function decimalTotalEquals(amounts:number[],total:number){
 if([...amounts,total].some(value=>!Number.isFinite(value)))return false;
 const {integers}=aligned([...amounts,total]);
 return integers.slice(0,-1).reduce((sum,value)=>sum+value,BigInt(0))===integers.at(-1);
}
// Add entered amounts exactly, so 500.35 - 2.2 is 498.15 rather than 498.15000000000003.
export function decimalSum(amounts:number[]){
 if(amounts.some(value=>!Number.isFinite(value)))return NaN;
 const {scale,integers}=aligned(amounts);
 const total=integers.reduce((sum,value)=>sum+value,BigInt(0)),negative=total<BigInt(0);
 const digits=(negative?-total:total).toString().padStart(scale+1,'0');
 return Number((negative?'-':'')+digits.slice(0,digits.length-scale)+(scale?'.'+digits.slice(-scale):''));
}

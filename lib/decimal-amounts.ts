// Match PostgreSQL numeric equality without binary floating point tails.
export function decimalTotalEquals(amounts:number[],total:number){
 if([...amounts,total].some(value=>!Number.isFinite(value)))return false;
 const parts=[...amounts,total].map(value=>{const [mantissa,exponent='0']=String(value).toLowerCase().split('e');const digits=mantissa.split('.');return {integer:BigInt(digits.join('')),scale:(digits[1]?.length??0)-Number(exponent)};});
 const scale=Math.max(...parts.map(value=>value.scale));
 const integers=parts.map(value=>value.integer*BigInt(10)**BigInt(scale-value.scale));
 return integers.slice(0,-1).reduce((sum,value)=>sum+value,BigInt(0))===integers.at(-1);
}

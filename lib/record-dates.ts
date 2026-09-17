// ISO calendar dates sort lexically; missing dates stay last in either direction.
export function compareRecordDates(a:string|null|undefined,b:string|null|undefined,order:'newest'|'oldest'='newest') {
 if(!a)return b?1:0;
 if(!b)return -1;
 return order==='oldest'?a.localeCompare(b):b.localeCompare(a);
}

export function matchesRecordDate(date:string|null|undefined,from:string,to:string) {
 if(!from&&!to)return true;
 return !!date&&(!from||date>=from)&&(!to||date<=to);
}

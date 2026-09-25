export function overviewBenchmarkStorageKey(owner:string){return 'finance:overview-benchmarks:'+owner;}
export function readOverviewBenchmarks(storage:Pick<Storage,'getItem'>,owner:string):string[]{
 try{const value=JSON.parse(storage.getItem(overviewBenchmarkStorageKey(owner))??'[]');return Array.isArray(value)&&value.every(key=>typeof key==='string')?[...new Set(value)]:[];}catch{return [];}
}
// Older saved selections contain only benchmarks; net worth remains visible
// unless the owner explicitly hides it.
const hiddenNetWorth='hidden:actual';
export function overviewSeriesVisible(selected:readonly string[],key:string){return key==='actual'?!selected.includes(hiddenNetWorth):selected.includes(key);}
export function toggleOverviewBenchmark(selected:readonly string[],key:string){const storedKey=key==='actual'?hiddenNetWorth:key;return selected.includes(storedKey)?selected.filter(item=>item!==storedKey):[...selected,storedKey];}

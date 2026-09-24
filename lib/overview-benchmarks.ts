export function overviewBenchmarkStorageKey(owner:string){return 'finance:overview-benchmarks:'+owner;}
export function readOverviewBenchmarks(storage:Pick<Storage,'getItem'>,owner:string):string[]{
 try{const value=JSON.parse(storage.getItem(overviewBenchmarkStorageKey(owner))??'[]');return Array.isArray(value)&&value.every(key=>typeof key==='string')?[...new Set(value)]:[];}catch{return [];}
}
export function toggleOverviewBenchmark(selected:readonly string[],key:string){return selected.includes(key)?selected.filter(item=>item!==key):[...selected,key];}

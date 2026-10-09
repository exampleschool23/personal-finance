// Background work over many owners: a few at a time, so a long list finishes inside the route's time limit without
// opening one database or Telegram request per owner at once.
/** Runs `task` for every item, at most `limit` at a time, and resolves once all have finished. A task that throws
 * rejects the whole run after the tasks already started settle; callers that must go on catch inside `task`. */
export async function forEachLimited<T>(items:readonly T[],limit:number,task:(item:T)=>Promise<void>):Promise<void>{
 const failures:unknown[]=[];let next=0;
 const worker=async()=>{
  while(next<items.length&&!failures.length){
   const item=items[next++];
   try{await task(item);}catch(error){failures.push(error);}
  }
 };
 await Promise.all(Array.from({length:Math.min(Math.max(1,limit),items.length)},worker));
 if(failures.length)throw failures[0];
}

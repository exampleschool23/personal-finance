/** Saved display order is independent of monthly funding priority. */
export function orderedGoals<T extends {id:string}>(goals:T[],ids:readonly string[]):T[]{
 const positions=new Map(ids.map((id,index)=>[id,index]));
 return [...goals].sort((a,b)=>(positions.get(a.id)??Infinity)-(positions.get(b.id)??Infinity));
}
/** New goals join the end of the saved order, in the order they were created; ids already placed move there too. */
export function appendGoals(ids:readonly string[],added:readonly string[]):string[]{
 const fresh=new Set(added);
 return [...ids.filter(id=>!fresh.has(id)),...new Set(added)];
}
/** The saved display order of goals, as goal ids. */
export const savedGoalOrder=(preferences:readonly {key:string;data:unknown}[]):string[]=>{const ids=(preferences.find(item=>item.key==='goal_order')?.data as {ids?:unknown}|undefined)?.ids;return Array.isArray(ids)?ids.filter((id):id is string=>typeof id==='string'):[];};
export function moveGoal(ids:readonly string[],id:string,direction:-1|1,visible:readonly string[]=ids):string[]{
 const next=[...ids],index=next.indexOf(id),visibleIndex=visible.indexOf(id),targetId=visible[visibleIndex+direction],target=next.indexOf(targetId);
 if(visibleIndex<0||index<0||target<0||target>=next.length)return next;
 [next[index],next[target]]=[next[target],next[index]];return next;
}

/** Reinsert visible cards while keeping hidden archived cards in their slots. */
export function reorderGoal(ids:readonly string[],id:string,target:string,visible:readonly string[]=ids):string[]{
 const from=visible.indexOf(id),to=visible.indexOf(target);
 if(from<0||to<0||from===to)return [...ids];
 const next=[...visible];next.splice(from,1);next.splice(to,0,id);
 const included=new Set(visible);let index=0;
 return ids.map(value=>included.has(value)?next[index++]:value);
}

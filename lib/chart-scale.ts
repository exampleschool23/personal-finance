// Round value-axis ticks (1, 2, 2.5 or 5 × 10ⁿ). The axis never dips below zero
// for non-negative data, so money charts do not show impossible negative ticks.
export function niceAxis(values:readonly number[],count=5):{domain:[number,number];ticks:number[]}{
 const finite=values.filter(Number.isFinite);
 let min=finite.length?Math.min(...finite):0,max=finite.length?Math.max(...finite):1;
 if(min>=0)min=Math.min(min,Math.max(0,min-(max-min)*.1));
 if(max===min){const pad=Math.max(Math.abs(max)*.1,1);max+=pad;min=min>=0?Math.max(0,min-pad):min-pad;}
 const rough=(max-min)/Math.max(1,count-1),magnitude=10**Math.floor(Math.log10(rough));
 const step=[1,2,2.5,5,10].map(factor=>factor*magnitude).find(candidate=>candidate>=rough)!;
 const start=Math.floor(min/step)*step,end=Math.ceil(max/step)*step;
 const ticks:number[]=[];
 for(let tick=start;tick<=end+step/2;tick+=step)ticks.push(Number(tick.toPrecision(12)));
 return {domain:[ticks[0],ticks.at(-1)!],ticks};
}

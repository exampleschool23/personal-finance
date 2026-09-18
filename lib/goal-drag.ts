type GoalBounds={id:string;left:number;right:number;top:number;bottom:number};
// Geometry is independent of pointer capture, nested content, and grid gaps.
export function goalDropTarget(cards:GoalBounds[],x:number,y:number):string|null{
 if(!cards.length)return null;
 const left=Math.min(...cards.map(card=>card.left)),right=Math.max(...cards.map(card=>card.right));
 const top=Math.min(...cards.map(card=>card.top)),bottom=Math.max(...cards.map(card=>card.bottom));
 if(x<left||x>right||y<top||y>bottom)return null;
 let nearest:GoalBounds|null=null,distance=Infinity;
 for(const card of cards){
  const dx=Math.max(card.left-x,0,x-card.right),dy=Math.max(card.top-y,0,y-card.bottom);
  const next=dx*dx+dy*dy;
  if(next<distance){nearest=card;distance=next;}
 }
 return nearest?.id??null;
}

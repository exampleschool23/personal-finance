"use client";
import {useLayoutEffect,useRef} from 'react';

export function useGoalLayoutAnimation(order:string){
 const ref=useRef<HTMLDivElement>(null);
 const previous=useRef(new Map<string,DOMRect>());
 const animations=useRef<Animation[]>([]);
 useLayoutEffect(()=>{
  const cards=Array.from(ref.current?.querySelectorAll<HTMLElement>('[data-goal-id]')??[]);
  animations.current.forEach(animation=>animation.cancel());
  animations.current=[];
  const next=new Map<string,DOMRect>();
  for(const card of cards){
   const id=card.dataset.goalId!,rect=card.getBoundingClientRect(),before=previous.current.get(id);
   next.set(id,rect);
   if(before&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&card.animate){
    const x=before.left-rect.left,y=before.top-rect.top;
    if(x||y)animations.current.push(card.animate([{transform:`translate(${x}px, ${y}px)`},{transform:'translate(0, 0)'}],{duration:280,easing:'cubic-bezier(0.2, 0.8, 0.2, 1)'}));
   }
  }
  previous.current=next;
 },[order]);
 useLayoutEffect(()=>()=>animations.current.forEach(animation=>animation.cancel()),[]);
 return ref;
}

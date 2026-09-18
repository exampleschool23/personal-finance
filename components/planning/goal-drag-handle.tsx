"use client";
import {useRef,useState} from 'react';
import {goalDropTarget} from '@/lib/goal-drag';
import {GripVertical} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useLanguage} from '@/components/language-provider';

type Props={name:string;disabled:boolean;onDrop:(target:string)=>void;onMove:(direction:-1|1)=>void;onTarget:(id:string|null)=>void};
export function GoalDragHandle({name,disabled,onDrop,onMove,onTarget}:Props){
 const {t}=useLanguage();
 const gesture=useRef<{x:number;y:number;pointerId:number;moved:boolean;target:string|null;grid:HTMLElement|null}|null>(null);
 const [dragging,setDragging]=useState(false);
 function targetAt(x:number,y:number){
  const cards=Array.from(gesture.current?.grid?.querySelectorAll<HTMLElement>('[data-goal-id]')??[]);
  return goalDropTarget(cards.map(card=>{
   const {left,right,top,bottom}=card.getBoundingClientRect();
   return {id:card.dataset.goalId!,left,right,top,bottom};
  }),x,y);
 }
 function clear(){gesture.current=null;setDragging(false);onTarget(null);}
 return <Button type="button" variant="ghost" size="icon" className="goal-drag-handle" disabled={disabled} data-dragging={dragging} aria-label={t('Reorder {name}',{name})} title={t('Drag to reorder. Arrow keys also move this goal.')} onClick={event=>event.stopPropagation()}
  onKeyDown={event=>{if(event.key==='Escape'){clear();event.stopPropagation();}else if(['ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(event.key)){event.preventDefault();event.stopPropagation();onMove(event.key==='ArrowUp'||event.key==='ArrowLeft'?-1:1);}}}
  onPointerDown={event=>{if(disabled||event.button!==0||gesture.current)return;event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);gesture.current={x:event.clientX,y:event.clientY,pointerId:event.pointerId,moved:false,target:null,grid:event.currentTarget.closest<HTMLElement>('.goal-cards')};}}
  onPointerMove={event=>{const current=gesture.current;if(!current||current.pointerId!==event.pointerId)return;if(Math.hypot(event.clientX-current.x,event.clientY-current.y)<6&&!current.moved)return;current.moved=true;setDragging(true);current.target=targetAt(event.clientX,event.clientY);onTarget(current.target);if(event.clientY<60)window.scrollBy(0,-18);else if(event.clientY>window.innerHeight-60)window.scrollBy(0,18);}}
  onPointerUp={event=>{const current=gesture.current;if(!current||current.pointerId!==event.pointerId)return;const target=targetAt(event.clientX,event.clientY);clear();if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);if(current.moved&&target)onDrop(target);}}
  onPointerCancel={clear} onLostPointerCapture={clear}><GripVertical size={18} aria-hidden="true"/></Button>;
}

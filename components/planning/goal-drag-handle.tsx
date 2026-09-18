"use client";
import {useRef,useState} from 'react';
import {GripVertical} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useLanguage} from '@/components/language-provider';

type Props={name:string;disabled:boolean;onDrop:(target:string)=>void;onMove:(direction:-1|1)=>void;onTarget:(id:string|null)=>void};
export function GoalDragHandle({name,disabled,onDrop,onMove,onTarget}:Props){
 const {t}=useLanguage();
 const gesture=useRef<{x:number;y:number;moved:boolean;target:string|null}|null>(null);
 const [dragging,setDragging]=useState(false);
 function clear(){gesture.current=null;setDragging(false);onTarget(null);}
 return <Button type="button" variant="ghost" size="icon" className="goal-drag-handle" disabled={disabled} data-dragging={dragging} aria-label={t('Reorder {name}',{name})} title={t('Drag to reorder. Arrow keys also move this goal.')} onClick={event=>event.stopPropagation()}
  onKeyDown={event=>{if(event.key==='Escape'){clear();event.stopPropagation();}else if(['ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(event.key)){event.preventDefault();event.stopPropagation();onMove(event.key==='ArrowUp'||event.key==='ArrowLeft'?-1:1);}}}
  onPointerDown={event=>{if(disabled||event.button!==0)return;event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);gesture.current={x:event.clientX,y:event.clientY,moved:false,target:null};}}
  onPointerMove={event=>{const current=gesture.current;if(!current)return;if(Math.hypot(event.clientX-current.x,event.clientY-current.y)<6&&!current.moved)return;current.moved=true;setDragging(true);current.target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-goal-id]')?.dataset.goalId??null;onTarget(current.target);if(event.clientY<60)window.scrollBy(0,-18);else if(event.clientY>window.innerHeight-60)window.scrollBy(0,18);}}
  onPointerUp={event=>{const current=gesture.current;clear();if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);if(current?.moved&&current.target)onDrop(current.target);}}
  onPointerCancel={clear} onLostPointerCapture={clear}><GripVertical size={18} aria-hidden="true"/></Button>;
}

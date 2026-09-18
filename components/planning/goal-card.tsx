"use client";
import type { ComponentProps } from 'react';

// The card is keyboard reachable; nested controls retain their own interactions.
export function GoalCard({ onOpen, ...props }: ComponentProps<'article'> & { onOpen: () => void }) {
 return <article {...props} tabIndex={0} onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();onOpen();}}} onClick={event => {
  if ((event.target as HTMLElement).closest('button,a,input,select,textarea,label,details,[role="button"]')) return;
  onOpen();
 }}/>;
}

"use client";
import Link from 'next/link';
import type { ComponentProps } from 'react';

export function DrawerLink({onClick,...props}:ComponentProps<typeof Link>){
 return <Link {...props} onClick={event=>{
  onClick?.(event);
  if(event.defaultPrevented||!event.shiftKey||event.button!==0)return;
  event.preventDefault();
  window.open(event.currentTarget.href,'_blank','noopener,noreferrer');
 }}/>;
}

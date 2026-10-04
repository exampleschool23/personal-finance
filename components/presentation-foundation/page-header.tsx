"use client";
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { useTopBarSlot } from '@/components/presentation-foundation/top-bar-slot';

/** The title block every workspace page opens with: optional eyebrow, title, actions, and an optional explanation behind an ⓘ. */
/** Inside the workspace the title moves up into the top bar, and the tabs and actions join it where the bar has room;
 * otherwise they open the page as one row. `tabs` (a `Segmented` with the `page-tabs` class) switch the page's views. */
export function PageHeader({ title, hint, eyebrow, tabs, className, children }: { title: string; hint?: ReactNode; eyebrow?: string; tabs?: ReactNode; className?: string; children?: ReactNode }) {
 const slot = useTopBarSlot();
 const heading = <h1>{title}{hint && <InfoHint>{hint}</InfoHint>}</h1>;
 const actions = children && <div className="entry-actions">{children}</div>;
 const classes = className ? `page-heading ${className}` : 'page-heading';
 if (!slot?.title) return <header className={classes}>
  <div>
   {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
   {heading}
   {tabs}
  </div>
  {actions}
 </header>;
 return <>
  {createPortal(<>{heading}{eyebrow && <p className="page-eyebrow">{eyebrow}</p>}{slot.actions && tabs}</>, slot.title)}
  {slot.actions ? actions && createPortal(actions, slot.actions) : (tabs || actions) && <header className={`${classes} page-heading-actions`}>{tabs}{actions}</header>}
 </>;
}

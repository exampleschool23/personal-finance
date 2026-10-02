import type { ReactNode } from 'react';
import { InfoHint } from '@/components/presentation-foundation/info-hint';

/** The title block every workspace page opens with: optional eyebrow, title, actions, and an optional explanation behind an ⓘ. */
export function PageHeader({ title, hint, eyebrow, className, children }: { title: string; hint?: ReactNode; eyebrow?: string; className?: string; children?: ReactNode }) {
 return <header className={className ? `page-heading ${className}` : 'page-heading'}>
  <div>
   {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
   <h1>{title}{hint && <InfoHint>{hint}</InfoHint>}</h1>
  </div>
  {children && <div className="entry-actions">{children}</div>}
 </header>;
}

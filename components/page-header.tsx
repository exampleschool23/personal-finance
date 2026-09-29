import type { ReactNode } from 'react';

/** The title block every workspace page opens with: optional eyebrow, title, one-line description and actions. */
export function PageHeader({ title, description, eyebrow, className, children }: { title: string; description?: ReactNode; eyebrow?: string; className?: string; children?: ReactNode }) {
 return <header className={className ? `page-heading ${className}` : 'page-heading'}>
  <div>
   {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
   <h1>{title}</h1>
   {description && <p className="muted">{description}</p>}
  </div>
  {children && <div className="entry-actions">{children}</div>}
 </header>;
}

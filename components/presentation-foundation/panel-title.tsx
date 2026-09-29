import type { ReactNode } from 'react';

type Props = { title: ReactNode; description?: ReactNode; count?: ReactNode; children?: ReactNode };

/** The heading row of a `.panel`: title with an optional count pill and one-line description, and any aside or action on the right. */
export function PanelTitle({ title, description, count, children }: Props) {
 return <div className="panel-title"><div><h2>{title}{count}</h2>{description && <p className="muted">{description}</p>}</div>{children}</div>;
}

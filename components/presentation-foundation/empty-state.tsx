import type { ReactNode } from 'react';

type Props = { icon: ReactNode; title?: ReactNode; description?: ReactNode; className?: string; id?: string; as?: 'div' | 'section'; children?: ReactNode };

/** A list or panel with nothing to show yet: an icon, an optional heading, one line of guidance and any actions. `id` lets a disabled control point to it as its reason. */
export function EmptyState({ icon, title, description, className, id, as: Tag = 'div', children }: Props) {
 return <Tag id={id} className={className ? `empty ${className}` : 'empty'}>{icon}{title && <h3>{title}</h3>}{description && <p>{description}</p>}{children}</Tag>;
}

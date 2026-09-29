import type { ReactNode } from 'react';

type Props = { icon: ReactNode; title?: ReactNode; description?: ReactNode; className?: string; as?: 'div' | 'section'; children?: ReactNode };

/** A list or panel with nothing to show yet: an icon, an optional heading, one line of guidance and any actions. */
export function EmptyState({ icon, title, description, className, as: Tag = 'div', children }: Props) {
 return <Tag className={className ? `empty ${className}` : 'empty'}>{icon}{title && <h3>{title}</h3>}{description && <p>{description}</p>}{children}</Tag>;
}

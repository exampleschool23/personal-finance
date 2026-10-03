import { Users } from 'lucide-react';
import { initials, SHARED } from '@/lib/household';

/** Someone in a shared household: their initials in a small circle, named on hover and for screen readers. */
export function PersonAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
 return <span className="person-avatar" data-size={size} role="img" aria-label={name} title={name}>{initials(name)}</span>;
}

/** The owner of an account or a transaction: one person's initials, or the household's mark when it is shared. */
export function OwnerAvatar({ owner, size = 'md' }: { owner: { id: string; name: string }; size?: 'sm' | 'md' }) {
 if (owner.id !== SHARED) return <PersonAvatar name={owner.name} size={size}/>;
 return <span className="person-avatar" data-shared="" data-size={size} role="img" aria-label={owner.name} title={owner.name}><Users size={size === 'sm' ? 13 : 16} aria-hidden="true"/></span>;
}

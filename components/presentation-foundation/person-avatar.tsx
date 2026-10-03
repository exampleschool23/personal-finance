import { initials } from '@/lib/household';

/** Someone in a shared household: their initials in a small circle, named on hover and for screen readers. */
export function PersonAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
 return <span className="person-avatar" data-size={size} role="img" aria-label={name} title={name}>{initials(name)}</span>;
}

import { Check } from 'lucide-react';

/** The tick before a settled row's icon. Open rows keep the same empty space, so icons stay in one column. */
export function DoneTick({ done }: { done: boolean }) {
 return <span className="done-tick" data-done={done || undefined} aria-hidden="true">{done && <Check size={12} strokeWidth={3}/>}</span>;
}

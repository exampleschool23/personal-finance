import type { ReactNode } from 'react';
import { InfoHint } from '@/components/presentation-foundation/info-hint';

type Props = { title: ReactNode; hint?: ReactNode; count?: ReactNode; children?: ReactNode };

/** The heading row of a `.panel`: one line with the title, an optional count pill and ⓘ explanation, and any aside or action on the right. */
export function PanelTitle({ title, hint, count, children }: Props) {
 return <div className="panel-title"><h2>{title}{count}{hint && <InfoHint>{hint}</InfoHint>}</h2>{children}</div>;
}

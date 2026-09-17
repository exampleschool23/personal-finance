import { Skeleton } from '@/components/ui/skeleton';

export function LoadingPlaceholder({ label, rows = 4 }: { label: string; rows?: number }) {
  return <div role="status" aria-busy="true" className="loading-placeholder">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="loading-lines">{Array.from({ length: rows }, (_, index) =>
      <div className="loading-row" key={index}><Skeleton className="loading-icon"/><div className="loading-copy"><Skeleton className="loading-line"/><Skeleton className="loading-detail"/></div><Skeleton className="loading-value"/></div>
    )}</div>
  </div>;
}

export function WorkspaceSkeleton({ label, section }: { label: string; section: string }) {
  return <div role="status" aria-busy="true">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true">
      <div className={section === 'Income & expenses' ? 'metrics recurring-metrics' : 'metrics'}>
        {Array.from({ length: section === 'Income & expenses' ? 3 : 4 }, (_, index) => <article key={index}><Skeleton className="h-4 w-2/3"/><Skeleton className="my-6 h-8 w-3/4"/><Skeleton className="h-3 w-full"/></article>)}
      </div>
      {section !== 'Loans & debts' && <div className={section === 'Overview' ? 'insights' : 'mb-6'}>
        {Array.from({ length: section === 'Overview' ? 2 : 1 }, (_, index) => <section className="panel" key={index}><Skeleton className="mb-6 h-5 w-1/3"/><Skeleton className="h-52 w-full"/></section>)}
      </div>}
      <section className="panel records"><Skeleton className="mb-6 h-5 w-1/3"/><LoadingPlaceholder label={label}/></section>
    </div>
  </div>;
}

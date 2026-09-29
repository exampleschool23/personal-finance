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
  if (section === 'Overview') return <div role="status" aria-busy="true" className="overview-content-loading">
    <span className="sr-only">{label}</span>
    <section aria-hidden="true" className="panel overview-hero"><Skeleton className="h-4 w-28"/><Skeleton className="my-4 h-12 w-64 max-w-full"/><Skeleton className="h-64 w-full"/></section>
    <div aria-hidden="true" className="stat-tiles" data-columns={4}>{Array.from({ length: 4 }, (_, index) => <article className="stat-tile" key={index}><Skeleton className="h-4 w-2/3"/><Skeleton className="h-7 w-3/4"/><Skeleton className="h-3 w-full"/></article>)}</div>
    <div aria-hidden="true" className="overview-grid">{Array.from({ length: 3 }, (_, index) => <section className="panel overview-panel" key={index}><Skeleton className="mb-6 h-5 w-1/3"/><Skeleton className="h-40 w-full"/></section>)}</div>
  </div>;
  return <div role="status" aria-busy="true">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="overview-content-loading">
      {section !== 'Assets & investments' && <div className="stat-tiles" data-columns={3}>
        {Array.from({ length: 3 }, (_, index) => <article className="stat-tile" key={index}><Skeleton className="h-4 w-2/3"/><Skeleton className="h-7 w-3/4"/><Skeleton className="h-3 w-full"/></article>)}
      </div>}
      {section !== 'Loans & debts' && <section className="panel"><Skeleton className="mb-6 h-5 w-1/3"/><Skeleton className="h-52 w-full"/></section>}
      <section className="panel records"><Skeleton className="mb-6 h-5 w-1/3"/><LoadingPlaceholder label={label}/></section>
    </div>
  </div>;
}

export function ChartSkeleton({ label, height = 310 }: { label: string; height?: number }) {
  return <div role="status" aria-busy="true" className="chart-skeleton shimmer" style={{ height }}>
    <span className="sr-only">{label}</span>
    <svg aria-hidden="true" viewBox="0 0 400 100" preserveAspectRatio="none">
      {[20, 45, 70].map(y => <line key={y} x1="0" x2="400" y1={y} y2={y}/>)}
      <path d="M0 82 C40 78 60 60 100 64 S160 40 200 46 S260 28 300 34 S360 14 400 18"/>
    </svg>
  </div>;
}

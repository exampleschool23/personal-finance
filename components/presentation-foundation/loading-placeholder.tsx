import { Skeleton } from '@/components/ui/skeleton';

export function LoadingPlaceholder({ label, rows = 4 }: { label: string; rows?: number }) {
  return <div role="status" aria-busy="true" className="loading-placeholder">
    <span className="sr-only">{label}</span>
    <SkeletonRows rows={rows}/>
  </div>;
}

function SkeletonRows({ rows }: { rows: number }) {
  return <div aria-hidden="true" className="loading-lines">{Array.from({ length: rows }, (_, index) =>
    <div className="loading-row" key={index}><Skeleton className="loading-icon"/><div className="loading-copy"><Skeleton className="loading-line"/><Skeleton className="loading-detail"/></div><Skeleton className="loading-value"/></div>
  )}</div>;
}

/** Placeholder tiles in the exact shape of a `StatTiles` row, so the figures do not push the page down when they arrive. */
export function StatTilesSkeleton({ label, columns = 3 }: { label?: string; columns?: 3 | 4 }) {
  const tiles = <div aria-hidden="true" className="stat-tiles" data-columns={columns}>{Array.from({ length: columns }, (_, index) => <article className="stat-tile" key={index}><Skeleton className="h-4 w-2/3"/><Skeleton className="h-7 w-3/4"/><Skeleton className="h-3 w-full"/></article>)}</div>;
  return label ? <div role="status" aria-busy="true"><span className="sr-only">{label}</span>{tiles}</div> : tiles;
}

/** A `.panel` whose heading and rows are still loading. */
export function PanelSkeleton({ label, rows = 3, className }: { label: string; rows?: number; className?: string }) {
  return <section className={className ? 'panel ' + className : 'panel'}><Skeleton aria-hidden="true" className="mb-4 h-5 w-1/3"/><LoadingPlaceholder label={label} rows={rows}/></section>;
}

/** A destination opened from the drawer while its route loads: a heading placeholder, then the page's own skeleton. */
export function PageSkeleton({ label, section }: { label: string; section: string }) {
  return <div className="content page-loading">
    <header aria-hidden="true" className="page-heading"><div><Skeleton className="h-9 w-64 max-w-full"/><Skeleton className="mt-3 h-4 w-80 max-w-full"/></div></header>
    <WorkspaceSkeleton label={label} section={section}/>
  </div>;
}

export function WorkspaceSkeleton({ label, section }: { label: string; section: string }) {
  if (section === 'Overview') return <div role="status" aria-busy="true" className="overview-content-loading">
    <span className="sr-only">{label}</span>
    <section aria-hidden="true" className="panel overview-hero"><Skeleton className="h-4 w-28"/><Skeleton className="my-4 h-12 w-64 max-w-full"/><Skeleton className="h-64 w-full"/></section>
    <StatTilesSkeleton columns={4}/>
    <div aria-hidden="true" className="overview-grid">{Array.from({ length: 3 }, (_, index) => <section className="panel overview-panel" key={index}><Skeleton className="mb-6 h-5 w-1/3"/><Skeleton className="h-40 w-full"/></section>)}</div>
  </div>;
  return <div role="status" aria-busy="true">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="overview-content-loading">
      {section !== 'Assets & investments' && <StatTilesSkeleton/>}
      {section === 'Income & expenses' ? <CashflowPreviewSkeleton/>
        : section !== 'Loans & debts' && <section className="panel"><Skeleton className="mb-6 h-5 w-1/3"/><Skeleton className="h-52 w-full"/></section>}
      <section className="panel records"><Skeleton className="mb-6 h-5 w-1/3"/><LoadingPlaceholder label={label}/></section>
    </div>
  </div>;
}

/** The two Cash flow preview panels (income this month, spending plans) while their records load. */
export function CashflowPreviewSkeleton({ label }: { label?: string }) {
  const grid = <div aria-hidden="true" className="cashflow-preview-grid">
    <section className="panel"><Skeleton className="mb-4 h-5 w-1/3"/><SkeletonRows rows={3}/></section>
    <section className="panel"><Skeleton className="mb-4 h-5 w-1/3"/><SkeletonRows rows={3}/></section>
  </div>;
  return label ? <div role="status" aria-busy="true"><span className="sr-only">{label}</span>{grid}</div> : grid;
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

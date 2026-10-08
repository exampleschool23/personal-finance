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

/** A destination opened from the drawer while its route loads: the page's own skeleton (the top bar already names it). */
export function PageSkeleton({ label, section }: { label: string; section: string }) {
  return <div className="content page-loading">
    <WorkspaceSkeleton label={label} section={section}/>
  </div>;
}

/** Shimmer for a drawer tap: a title bar and rows only. The full workspace layout is for the first load and reloads. */
export function NavigationShimmer({ label }: { label: string }) {
  return <div className="content page-loading" role="status" aria-busy="true">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true"><Skeleton className="mb-6 h-8 w-1/3"/><SkeletonRows rows={4}/></div>
  </div>;
}

/** The dashboard board's two columns of cards, in the person's saved order. */
export type DashboardSkeletonColumns = { left: readonly string[]; right: readonly string[] };
const defaultDashboardSkeleton: DashboardSkeletonColumns = { left: ['net_worth', 'spending'], right: ['goals', 'transactions', 'upcoming'] };
const chartCards = new Set(['spending', 'allocation', 'forecast', 'income']);

/** One dashboard card while the workspace loads: Net worth in its full shape, chart cards with a chart, the rest with rows. */
function DashboardCardSkeleton({ card }: { card: string }) {
  if (card === 'net_worth') return <section className="panel overview-hero"><div className="overview-hero-head"><div className="overview-hero-value"><Skeleton className="h-8 w-40"/><Skeleton className="h-8 w-48 max-w-full"/></div><Skeleton className="h-11 w-96 max-w-full rounded-xl"/></div><NetWorthBodySkeleton/></section>;
  return <section className="panel overview-panel"><Skeleton className="mb-6 h-8 w-1/3"/>{chartCards.has(card) ? <Skeleton className="h-52 w-full"/> : <SkeletonRows rows={3}/>}</section>;
}

export function WorkspaceSkeleton({ label, section, columns = defaultDashboardSkeleton }: { label: string; section: string; columns?: DashboardSkeletonColumns }) {
  // The first few cards of each column fill the screen; drawing every card would only make the page longer than it loads.
  if (section === 'Overview') return <div role="status" aria-busy="true" className="overview-content-loading">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="dashboard-grid">{[columns.left, columns.right].map((cards, index) => <div className="dashboard-column" key={index}>{cards.slice(0, 3).map(card => <DashboardCardSkeleton card={card} key={card}/>)}</div>)}</div>
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

/** Accounts while records load, in the loaded page's shape: a balance tile per preferred currency, one account group with its cards, and the selected account's card beside it. */
export function AccountsSkeleton({ label, currencies = 1, filters = false }: { label: string; currencies?: number; filters?: boolean }) {
  return <div role="status" aria-busy="true" className="overview-content-loading">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="stat-tiles" data-columns="auto">{Array.from({ length: Math.max(1, currencies) }, (_, index) => <article className="stat-tile" key={index}><Skeleton className="h-4 w-28"/><Skeleton className="h-8 w-36"/></article>)}</div>
    {filters && <div aria-hidden="true" className="transactions-tools"><Skeleton className="h-11 w-44 rounded-xl"/><Skeleton className="h-11 w-36 rounded-xl"/></div>}
    <div aria-hidden="true" className="accounts-master-detail">
      <section className="account-directory"><div className="panel account-group">
        <div className="account-group-skeleton-head"><Skeleton className="h-6 w-28"/><Skeleton className="ms-auto h-6 w-36"/></div>
        <div className="account-card-grid">{Array.from({ length: 5 }, (_, index) => <div className="account-sortable-row" key={index}><div className="account-list-row"><Skeleton className="size-[38px] rounded-[10px]"/><span className="account-list-name"><Skeleton className="h-5 w-36 max-w-full"/><Skeleton className="mt-1.5 h-[18px] w-24"/></span><strong><Skeleton className="h-6 w-24"/></strong></div></div>)}</div>
      </div></section>
      <div className="account-selected-panel"><article className="panel account-card">
        <header><Skeleton className="size-[38px] rounded-[10px]"/><div className="account-card-heading"><Skeleton className="h-6 w-32"/><Skeleton className="h-4 w-24"/></div></header>
        <Skeleton className="mt-2 h-12 w-48 max-w-full"/>
        <div className="account-balance-facts"><Skeleton className="h-5 w-full"/><Skeleton className="h-5 w-full"/></div>
        <div className="account-card-actions"><Skeleton className="h-[42px] w-full"/><Skeleton className="h-[42px] w-full"/></div>
      </article></div>
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

/** A chart while its data loads. Without a label it is decoration inside a larger loading region. */
export function ChartSkeleton({ label, height = 310 }: { label?: string; height?: number }) {
  return <div role={label ? 'status' : undefined} aria-busy={label ? true : undefined} aria-hidden={label ? undefined : true} className="chart-skeleton shimmer" style={{ height }}>
    {label && <span className="sr-only">{label}</span>}
    <svg aria-hidden="true" viewBox="0 0 400 100" preserveAspectRatio="none">
      {[20, 45, 70].map(y => <line key={y} x1="0" x2="400" y1={y} y2={y}/>)}
      <path d="M0 82 C40 78 60 60 100 64 S160 40 200 46 S260 28 300 34 S360 14 400 18"/>
    </svg>
  </div>;
}

/** The Net worth card below its header while history loads: chart heading, tracking date, legend, chart, the three period totals and the settings row, in the card's final shape so nothing moves when they arrive. */
export function NetWorthBodySkeleton({ label }: { label?: string }) {
  const body = <div aria-hidden="true">
    <div className="overview-chart-heading"><div className="overview-chart-title"><Skeleton className="h-6 w-36"/><Skeleton className="h-9 w-56"/></div><div className="comparison-legend w-full">{[112, 96, 120, 136].map(width => <Skeleton key={width} className="h-8 rounded-full" style={{ width }}/>)}</div></div>
    <ChartSkeleton/>
    <div className="portfolio-headline">{[0, 1, 2].map(index => <div key={index}><Skeleton className="h-5 w-28 max-w-full"/><Skeleton className="h-8 w-32 max-w-full"/></div>)}</div>
    <div className="overview-details"><div className="net-worth-skeleton-settings"><Skeleton className="h-4 w-44"/></div></div>
  </div>;
  return label ? <div role="status" aria-busy="true"><span className="sr-only">{label}</span>{body}</div> : body;
}

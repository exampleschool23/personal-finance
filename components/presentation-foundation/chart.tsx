/**
 * The one look every chart shares: grid, axes, tooltip, legend, bars, lines and areas. Spread these into the recharts
 * pieces (`<CartesianGrid {...chartGrid}/>`, `<Bar {...chartBar} dataKey="…"/>`) instead of writing styles inline, so a
 * change here changes every chart at once. Colours, tick text and the tooltip box live in `app/styles/assets.css`
 * (`.recharts-*`). This file imports nothing from recharts, so a test can stub the library and still use it.
 */
import { formatCompactMoney, formatMonthShort, formatMonthYear } from '@/lib/format';

/** Chart heights: `compact` inside dialogs and cards, `regular` for a panel's main chart, `tall` for a page's lead chart. */
export const chartHeight = { compact: 220, regular: 260, tall: 300 } as const;

/** Room around the plot; the axes bring their own tick margins. */
export const chartMargin = { top: 12, right: 8, left: 0, bottom: 4 };

/** Faint horizontal guides only. */
export const chartGrid = { stroke: 'var(--border)', strokeOpacity: .6, strokeDasharray: '2 6', vertical: false } as const;

/** Both axes: no axis line or tick marks, just the labels. */
export const chartAxis = { axisLine: false, tickLine: false, tickMargin: 10 } as const;
/** The value axis sizes itself to its longest label. */
export const chartValueAxis = { ...chartAxis, width: 'auto' } as const;

/** The hover box and the column highlight behind it. */
export const chartTooltip = { cursor: { fill: 'var(--accent)', fillOpacity: .45 }, isAnimationActive: false, contentStyle: { borderRadius: 12 } } as const;

/** A recharts legend, where the clickable `SeriesLegend` does not fit (Sankey and pie companions). */
export const chartLegend = { iconType: 'circle', iconSize: 8 } as const;

/** A column. In a stack, only the top series gets the rounded corners: pass `stackTop(isTop)`. */
export const chartBar = { radius: [6, 6, 0, 0] as [number, number, number, number], maxBarSize: 28, isAnimationActive: false };
export const stackTop = (top: boolean) => ({ radius: top ? chartBar.radius : [0, 0, 0, 0] as [number, number, number, number] });
/** What is planned, scheduled or estimated, not yet real: a dashed outline with a light tint. Recorded figures sit inside it. */
export const plannedBar = { ...chartBar, fill: 'var(--primary)', fillOpacity: .12, stroke: 'var(--primary)', strokeDasharray: '4 3' };
/** Columns side by side (income beside expenses): narrower, so a group still reads as one period. */
export const groupedBar = { ...chartBar, maxBarSize: 18 };
/** A recorded column drawn inside its planned outline. */
export const recordedBar = { ...chartBar, fillOpacity: .85 };

/** Lines: the lead series is the primary colour and thicker; comparisons are thinner, guides dashed and grey. */
export const chartLine = { strokeWidth: 2, dot: false, isAnimationActive: false, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
export const leadLine = { ...chartLine, stroke: 'var(--primary)', strokeWidth: 2.5 } as const;
export const guideLine = { ...chartLine, stroke: 'var(--muted-foreground)', strokeDasharray: '4 4', strokeWidth: 1.5 } as const;
/** A marked data point: a ring in the line's colour around the card colour. */
export const chartDot = { r: 4, strokeWidth: 2, fill: 'var(--card)' } as const;
/** A filled area under the lead line, fading out: put `<ChartGradient id={id}/>` in the chart and pass the same id. */
export const leadArea = (id: string) => ({ ...leadLine, fill: `url(#${id})` });
/** A reference line (zero, today, a target). */
export const referenceLine = { stroke: 'var(--muted-foreground)', strokeDasharray: '4 4' } as const;
/** The fade under a lead area, top to bottom. Plain SVG, so it sits inside any recharts chart. */
export function ChartGradient({ id, color = 'var(--primary)' }: { id: string; color?: string }) {
 return <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={.22}/><stop offset="100%" stopColor={color} stopOpacity={0}/></linearGradient></defs>;
}

/** Money in and money out, wherever both are drawn. */
export const chartColors = { income: 'var(--positive)', expense: 'color-mix(in srgb, var(--foreground) 55%, transparent)', other: 'var(--muted-foreground)' } as const;

/** A donut of shares. */
export const chartDonut = { innerRadius: '58%', outerRadius: '92%', paddingAngle: 1, stroke: 'var(--card)' } as const;
/** A Sankey of flows: thin nodes with rounded ends, grey links. */
export const chartSankey = { nodePadding: 16, nodeWidth: 10 } as const;
export const sankeyLink = { stroke: 'var(--border)', strokeOpacity: .9 } as const;
export const sankeyNodeRadius = 3;

/** Tick and tooltip labels through the shared formatters. */
export const moneyTick = (currency: string, locale: string) => (value: unknown) => formatCompactMoney(Number(value), currency, locale);
export const monthTick = (locale: string) => (month: unknown) => formatMonthShort(String(month), locale);
export const monthLabel = (locale: string) => (month: unknown) => formatMonthYear(String(month), locale);

type Flows = { nodes: ReadonlyArray<{ name: string }>; links: ReadonlyArray<{ source: number; target: number; value: number }> };

/** A rough width for 12px interface text, used where the page cannot measure (server, tests). Wide scripts take about a full em per character. */
export function estimateLabelWidth(text: string) {
 let width = 0;
 for (const char of text) width += char.codePointAt(0)! >= 0x2e80 ? 12 : 6.8;
 return width;
}

/** A node's amount as the chart draws it: the larger of what flows in and what flows out. */
export function sankeyNodeValue(flows: Flows, index: number) {
 let incoming = 0, outgoing = 0;
 for (const link of flows.links) { if (link.target === index) incoming += link.value; if (link.source === index) outgoing += link.value; }
 return Math.max(incoming, outgoing);
}

/** Room beside the first column (sources, labelled to their left) and the last (sinks, labelled to their right) for the longest label on each side, so no label is cut off and no side wastes space. */
export function sankeyLabelMargins(flows: Flows, label: (name: string, value: number) => string, measure: (text: string) => number = estimateLabelWidth) {
 // The gap between a bar and its label, plus a little slack for rounding.
 const gap = 14;
 let left = 0, right = 0, middle = 0;
 flows.nodes.forEach((node, index) => {
  const width = measure(label(node.name, sankeyNodeValue(flows, index)));
  const source = !flows.links.some(link => link.target === index), sink = !flows.links.some(link => link.source === index);
  if (source) left = Math.max(left, width);
  if (sink) right = Math.max(right, width);
  if (!source && !sink) middle = Math.max(middle, width);
 });
 return { left: Math.ceil(left) + gap, right: Math.ceil(right) + gap, middle: Math.ceil(middle) + gap };
}

/** How many columns the chart draws: the longest chain of flows from a source to a sink, counted in nodes. */
export function sankeyColumns(flows: Flows) {
 const depth = new Map<number, number>();
 const of = (index: number, seen: ReadonlySet<number>): number => {
  if (depth.has(index)) return depth.get(index)!;
  const next = flows.links.filter(link => link.source === index && !seen.has(link.target)).map(link => of(link.target, new Set([...seen, index])));
  const value = 1 + Math.max(0, ...next);
  depth.set(index, value);
  return value;
 };
 return Math.max(0, ...flows.nodes.map((_, index) => of(index, new Set())));
}

/** The narrowest the chart may draw before it scrolls: its label margins, and between each pair of columns room for
 * a middle column's label (drawn beside its bar, over the flows) with the flows still curving gently past it. */
export function sankeyMinWidth(flows: Flows, margins: { left: number; right: number; middle?: number }, perColumn = 140) {
 return Math.ceil(margins.left + margins.right + Math.max(1, sankeyColumns(flows) - 1) * Math.max(perColumn, (margins.middle ?? 0) + 24));
}

let canvas: HTMLCanvasElement | undefined;
/** Measures a label in the chart's own font when a page is available. */
export function measureLabel(text: string) {
 if (typeof document === 'undefined') return estimateLabelWidth(text);
 const context = (canvas ??= document.createElement('canvas')).getContext('2d');
 if (!context) return estimateLabelWidth(text);
 context.font = `12px ${getComputedStyle(document.body).fontFamily}`;
 return context.measureText(text).width;
}

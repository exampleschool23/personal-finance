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
 let left = 0, right = 0;
 flows.nodes.forEach((node, index) => {
  const width = measure(label(node.name, sankeyNodeValue(flows, index)));
  if (!flows.links.some(link => link.target === index)) left = Math.max(left, width);
  if (!flows.links.some(link => link.source === index)) right = Math.max(right, width);
 });
 return { left: Math.ceil(left) + gap, right: Math.ceil(right) + gap };
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

/** Whether a list's rows fit on one line: the name column keeps at least `minName` beside the widest cell of each trailing column.
 * `cells` holds each row's trailing cell widths, in column order; `gap` separates every column and `padding` is the row's inline padding. */
export function columnsFit({ available, minName, gap, padding, cells }: { available: number; minName: number; gap: number; padding: number; cells: readonly (readonly number[])[] }) {
 const widest: number[] = [];
 for (const row of cells) row.forEach((width, index) => { widest[index] = Math.max(widest[index] ?? 0, width); });
 const needed = minName + padding + widest.reduce((sum, width) => sum + width + gap, 0);
 return needed <= available;
}

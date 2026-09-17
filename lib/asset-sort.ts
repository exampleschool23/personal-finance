import { value, type Entry } from './finance';

// Compare total holdings in one display currency; unconvertible holdings come last.
export function sortAssetsByWorth(entries: Entry[], convert: (entry: Entry) => Entry | null = entry => entry) {
  return entries.map(entry => {
    const converted = convert(entry);
    return { entry, worth: converted ? value(converted) : null };
  }).sort((a, b) => {
    if (a.worth === null && b.worth !== null) return 1;
    if (b.worth === null && a.worth !== null) return -1;
    return (b.worth ?? 0) - (a.worth ?? 0) || a.entry.id.localeCompare(b.entry.id);
  }).map(({ entry }) => entry);
}

import type { Entry } from './finance';
export const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
export function matchingNames(rows: Entry[], entry: Pick<Entry, 'id' | 'kind' | 'name'>, original?: Entry) {
  const query = normalizeName(entry.name);
  if (!query) return [];
  const groups = new Map<string, { name: string; count: number; exact: boolean }>();
  for (const row of rows) {
    if (row.kind !== entry.kind) continue;
    const containsCurrent = row.record_count === undefined ? row.id === entry.id : !!original && row.kind === original.kind && row.currency === original.currency && row.frequency === original.frequency && normalizeName(row.name) === normalizeName(original.name);
    const count = (row.record_count ?? 1) - (containsCurrent ? 1 : 0);
    if (count <= 0) continue;
    const key = normalizeName(row.name);
    if (!key.includes(query)) continue;
    const group = groups.get(key);
    if (group) group.count += count;
    else groups.set(key, { name: row.name.trim().replace(/\s+/g, ' '), count, exact: key === query });
  }
  return [...groups.values()].sort((a,b) => Number(b.exact) - Number(a.exact) || a.name.localeCompare(b.name));
}

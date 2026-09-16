import type { Entry } from './finance';
export const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
export function matchingNames(rows: Entry[], entry: Pick<Entry, 'id' | 'kind' | 'name'>) {
  const query = normalizeName(entry.name);
  if (!query) return [];
  const groups = new Map<string, { name: string; count: number; exact: boolean }>();
  for (const row of rows) {
    if (row.id === entry.id || row.kind !== entry.kind) continue;
    const key = normalizeName(row.name);
    if (!key.includes(query)) continue;
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { name: row.name.trim().replace(/\s+/g, ' '), count: 1, exact: key === query });
  }
  return [...groups.values()].sort((a,b) => Number(b.exact) - Number(a.exact) || a.name.localeCompare(b.name));
}

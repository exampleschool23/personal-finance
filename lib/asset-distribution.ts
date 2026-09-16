import { assets, value, type Entry } from './finance';
// Call with entries already converted to the selected display currency.
export function assetDistribution(entries: Entry[]) {
  const groups = new Map<string, { name: string; kind: string; amount: number }>();
  for (const entry of entries) {
    const amount = value(entry);
    if (!assets.includes(entry.kind) || !Number.isFinite(amount) || amount <= 0) continue;
    const name = entry.name.trim().replace(/\s+/g, ' ');
    const key = JSON.stringify([entry.kind, name.toLowerCase()]);
    const group = groups.get(key);
    if (group) group.amount += amount;
    else groups.set(key, { name, kind: entry.kind, amount });
  }
  return [...groups.values()].sort((a, b) => b.amount - a.amount);
}

import { formatWho as who } from './format-who.ts';
import type { By, RefusalRow } from './types.ts';

export function countRefusals(rows: RefusalRow[], by: By): { key: string; count: number }[] {
  const keyOf = { reason: (r: RefusalRow) => r.reason ?? '(none)', session: who, tool: (r: RefusalRow) => r.tool ?? '(unknown)' }[by];
  const n = new Map<string, number>();
  for (const r of rows) n.set(keyOf(r), (n.get(keyOf(r)) ?? 0) + 1);
  return [...n].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

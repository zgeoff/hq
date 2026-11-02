import type { Database } from 'bun:sqlite';
import { countRefusals as tally } from './count-refusals.ts';
import { loadRefusalRows as refusalRows } from './load-refusal-rows.ts';

export function loadRefusalsSummary(db: Database, from: Date, to: Date): string {
  const rows = refusalRows(db, from, to);
  if (!rows.length) return 'Refusals: none';
  const top = tally(rows.filter((r) => r.reason), 'reason').slice(0, 3);
  return `Refusals: ${rows.length} (${top.length > 0 ? `top reasons: ${top.map((t) => `${formatReason(t.key)} x${t.count}`).join('; ')}` : 'no reasons recorded'})`;
}

function formatReason(s: string): string {
  return s.length > 80 ? `${s.slice(0, 79)}…` : s;
}

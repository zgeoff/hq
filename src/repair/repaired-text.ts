import type { planRepair } from './plan-repair.ts';

export function repairedText(plan: ReturnType<typeof planRepair>): string {
  const out = [...plan.lineText];
  const changed = new Set(plan.changes.map((c) => c.line - 1));
  for (const r of plan.recs) if (changed.has(r.line)) out[r.line] = JSON.stringify(r.obj);
  return out.join('\n');
}

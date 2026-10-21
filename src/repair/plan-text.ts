import type { RepairPlan } from './types.ts';

const short = (u: string | null) => (u ? u.slice(0, 8) : 'null');

export function planText(plan: RepairPlan, file: string, applied: string | null): string {
  if (!plan.splits.length) {
    const off = plan.offBranch.length ? ` ${plan.offBranch.length} split result(s) lie off the live branch and are left alone.` : '';
    return `${file}: no split advisor result on the live branch; nothing to repair.${off}`;
  }
  const out = [`${file}: ${plan.splits.length} split advisor result(s) on the live branch.`];
  for (const s of plan.splits) out.push(`  advisor use ${short(s.use)} → result ${short(s.result)}, split by ${s.interlopers.map(short).join(', ')}; the turn ends at ${short(s.anchor)}`);
  out.push('changes (parentUuid only):');
  for (const c of plan.changes) out.push(`  line ${c.line} ${short(c.uuid)}: ${short(c.from)} → ${short(c.to)} (${c.why})`);
  if (plan.offBranch.length) out.push(`${plan.offBranch.length} split result(s) off the live branch, left alone: ${plan.offBranch.map(short).join(', ')}`);
  out.push(applied ?? 'Dry run: nothing written. Add --apply to write it.');
  return out.join('\n');
}

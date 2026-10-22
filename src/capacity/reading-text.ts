import { formatGiB as gib } from './format-gib.ts';
import { formatNumber as n0 } from './format-number.ts';
import type { Reading } from './types.ts';

// The plain reading, for `hq capacity` and `hq capacity sample`.
export function readingText(r: Reading): string {
  const none = 'no reading';
  const mib = (x: number | null) => (x === null ? none : `${n0(x)} MiB`);
  const pct = (x: number | null) => (x === null ? none : `${Math.round(x)}%`);
  const g = (x: number | null, d = 1) => (x === null ? none : `${gib(x, d)} GiB`);
  return [
    `Sample ${r.at}:`,
    `  impd     non-Nix awake ${mib(r.nonnix_awake_mib)} (${r.nonnix_awake_vcpus ?? '?'} vCPUs), Nix awake ${mib(r.nix_awake_mib)}; used ${mib(r.impd_used_mib)} of ${mib(r.impd_budget_mib)} budget, committed ${mib(r.impd_committed_mib)}`,
    `  cloud    memory available ${g(r.cloud_avail_bytes)} of ${g(r.cloud_total_bytes)}`,
    `  Claude   5h ${pct(r.claude_five_hour)}, 7d ${pct(r.claude_seven_day)}${r.claude_at ? ` (read ${r.claude_at})` : ''}`,
    `  CI       ${r.ci_minutes_today === null ? none : `${n0(r.ci_minutes_today)} min today`}`,
    `  1Pass    ${r.op_account_used === null || r.op_account_limit === null ? none : `${n0(r.op_account_used)} of ${n0(r.op_account_limit)} requests today`}${r.op_refused === 1 ? ', refusing requests' : ''}`,
    `  PC       disk free ${g(r.pc_disk_free_bytes, 0)}, memory available ${g(r.pc_mem_avail_bytes)} (shown only; hq health alerts on these)`,
    ...Object.entries(r.errors).map(([k, v]) => `  ! ${k}: ${v}`),
  ].join('\n');
}

import type { Database } from 'bun:sqlite';
import type { CapacitySampleRow } from '../kdb.ts';
import { capacitySettings } from './capacity-settings.ts';
import { formatGiB as gib } from './format-gib.ts';
import { formatNumber as n0 } from './format-number.ts';

// For the daily check-in: the newest sample, if it is no more than RECENT_MIN minutes old (the
// daily line trusts a sample no older than this).
export function loadCapacityLine(db: Database, at: Date): string {
  const RECENT_MIN = 15,
    r = db.query('SELECT * FROM capacity_samples ORDER BY at DESC LIMIT 1').get() as CapacitySampleRow | null;
  if (!r || !(at.getTime() - Date.parse(r.at) <= RECENT_MIN * 60_000)) return 'Capacity: no recent reading';
  const s = capacitySettings(db);
  const none = 'no reading';
  const impd = r.nonnix_awake_mib === null ? none : `non-Nix ${n0(r.nonnix_awake_mib)}/${n0(s.nonnixMaxMib)} MiB awake${r.impd_used_mib === null || r.impd_budget_mib === null ? '' : ` (used ${n0(r.impd_used_mib)}/${n0(r.impd_budget_mib)})`}`;
  const cloud = r.cloud_avail_bytes === null ? none : `${gib(r.cloud_avail_bytes)} GiB free`;
  const claude = r.claude_five_hour === null && r.claude_seven_day === null ? none : `5h ${r.claude_five_hour === null ? none : `${Math.round(r.claude_five_hour)}%`}, 7d ${r.claude_seven_day === null ? none : `${Math.round(r.claude_seven_day)}%`}`;
  const ci = r.ci_minutes_today === null ? none : `${n0(r.ci_minutes_today)} min`;
  const pc = r.pc_disk_free_bytes === null && r.pc_mem_avail_bytes === null ? none : `${r.pc_disk_free_bytes === null ? none : `${gib(r.pc_disk_free_bytes, 0)} GiB disk`}, ${r.pc_mem_avail_bytes === null ? none : `${gib(r.pc_mem_avail_bytes)} GiB memory free`}`;
  return `Capacity: impd ${impd}; cloud ${cloud}; Claude ${claude}; CI today ${ci}; PC ${pc}`;
}

import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { capacitySettings } from './capacity-settings.ts';
import { formatGiB as gib } from './format-gib.ts';
import { formatNumber as n0 } from './format-number.ts';

const LatestSampleRow = z
  .object({
    at: z.string(),
    nonnix_awake_mib: z.number().nullable(),
    impd_used_mib: z.number().nullable(),
    impd_budget_mib: z.number().nullable(),
    cloud_avail_bytes: z.number().nullable(),
    claude_five_hour: z.number().nullable(),
    claude_seven_day: z.number().nullable(),
    ci_minutes_today: z.number().nullable(),
    pc_disk_free_bytes: z.number().nullable(),
    pc_mem_avail_bytes: z.number().nullable(),
  })
  .nullable();

export function loadCapacityLine(db: Database, at: Date): string {
  const RECENT_MIN = 15;
  const sample = LatestSampleRow.parse(db.query('SELECT * FROM capacity_samples ORDER BY at DESC LIMIT 1').get());
  if (!sample || !(at.getTime() - Date.parse(sample.at) <= RECENT_MIN * 60_000)) {
    return 'Capacity: no recent reading';
  }
  const settings = capacitySettings(db);
  const none = 'no reading';
  const impd = sample.nonnix_awake_mib === null ? none : `non-Nix ${n0(sample.nonnix_awake_mib)}/${n0(settings.nonnixMaxMib)} MiB awake${sample.impd_used_mib === null || sample.impd_budget_mib === null ? '' : ` (used ${n0(sample.impd_used_mib)}/${n0(sample.impd_budget_mib)})`}`;
  const cloud = sample.cloud_avail_bytes === null ? none : `${gib(sample.cloud_avail_bytes)} GiB free`;
  const claude = sample.claude_five_hour === null && sample.claude_seven_day === null ? none : `5h ${sample.claude_five_hour === null ? none : `${Math.round(sample.claude_five_hour)}%`}, 7d ${sample.claude_seven_day === null ? none : `${Math.round(sample.claude_seven_day)}%`}`;
  const ci = sample.ci_minutes_today === null ? none : `${n0(sample.ci_minutes_today)} min`;
  const pc = sample.pc_disk_free_bytes === null && sample.pc_mem_avail_bytes === null ? none : `${sample.pc_disk_free_bytes === null ? none : `${gib(sample.pc_disk_free_bytes, 0)} GiB disk`}, ${sample.pc_mem_avail_bytes === null ? none : `${gib(sample.pc_mem_avail_bytes)} GiB memory free`}`;
  return `Capacity: impd ${impd}; cloud ${cloud}; Claude ${claude}; CI today ${ci}; PC ${pc}`;
}

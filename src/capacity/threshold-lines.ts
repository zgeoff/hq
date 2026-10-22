import type { Database } from 'bun:sqlite';
import { capacitySettings } from './capacity-settings.ts';
import { formatGiB as gib } from './format-gib.ts';
import type { Reading } from './types.ts';

export function thresholdLines(db: Database, r: Reading | null): string[] {
  const s = capacitySettings(db);
  const val = (v: string | null) => (v === null ? 'no reading' : v);
  return [
    `nonnixMaxMib ${s.nonnixMaxMib}: now ${val(r?.nonnix_awake_mib == null ? null : String(r.nonnix_awake_mib))}`,
    `cloudMinAvailGiB ${s.cloudMinAvailGiB}: now ${val(r?.cloud_avail_bytes == null ? null : gib(r.cloud_avail_bytes))}`,
    `claudeSevenDayPct ${s.claudeSevenDayPct}: now ${val(r?.claude_seven_day == null ? null : String(Math.round(r.claude_seven_day)))}`,
    `claudeFiveHourPct ${s.claudeFiveHourPct}: now ${val(r?.claude_five_hour == null ? null : String(Math.round(r.claude_five_hour)))}`,
    `opDailyPct ${s.opDailyPct}: now ${val(formatOnePasswordPct(r))}`,
    `holdSamples ${s.holdSamples}`,
  ];
}

// The 1Password account's requests today as a share of its daily limit; null with no reading.
function formatOnePasswordPct(r: Reading | null): string | null {
  const limit = r?.op_account_limit ?? null,
    used = r?.op_account_used ?? null;
  if (used === null || limit === null || limit === 0) {
    return null;
  }
  return String(Math.round((used / limit) * 100));
}

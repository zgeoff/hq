import type { Pin } from '../pins/types.ts';

export const IDLE_REPORT_MS = 24 * 3_600_000;

export interface IdlePinReport {
  pin: Pin;
  idleSinceMs: number;
}

// lastReportMs maps a session id to the time of its last report. One report covers one idle
// stretch, which ends when the session is next active.
export function pickIdlePinReports(pins: readonly Pin[], fleetIDs: ReadonlySet<string>, lastReportMs: ReadonlyMap<string, number>): IdlePinReport[] {
  const reports: IdlePinReport[] = [];
  for (const pin of pins) {
    if (fleetIDs.has(pin.id) || pin.idleMs === null || pin.lastActivityAt === null || pin.idleMs <= IDLE_REPORT_MS) {
      continue;
    }
    const idleSinceMs = Date.parse(pin.lastActivityAt);
    if ((lastReportMs.get(pin.id) ?? -Infinity) < idleSinceMs) {
      reports.push({ pin, idleSinceMs });
    }
  }
  return reports;
}

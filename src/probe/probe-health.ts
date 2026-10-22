import type { Database } from 'bun:sqlite';
import { formatClock } from './format-clock.ts';
import { lastSample } from './last-sample.ts';
import { OPEN_AFTER } from './open-after.ts';
import { openOutage } from './open-outage.ts';

// For hq health: red while an outage is open, or when the probe has stopped.
export function probeHealth(db: Database, at: Date): { key: string; ok: boolean; line: string } {
  const last = lastSample(db);
  if (!last) return { key: 'nix-probe', ok: true, line: 'nix probe: no samples yet (hq probe timer install starts it)' };
  const age = (at.getTime() - Date.parse(last.at)) / 60_000;
  if (age > 5) return { key: 'nix-probe', ok: false, line: `nix probe: stopped, last sample ${Math.floor(age)} min ago (${last.at})` };
  const open = openOutage(db);
  if (open) {
    return { key: 'nix-probe', ok: false, line: `nix probe: Nix is down since ${formatClock(open.started_at)} Sydney` };
  }
  if (!last.target_ok && last.control_ok === 1) return { key: 'nix-probe', ok: true, line: `nix probe: last check ${Math.floor(age)} min ago failed (control fine); an outage opens after ${OPEN_AFTER} failed checks in a row` };
  if (!last.target_ok && last.control_ok === 0) return { key: 'nix-probe', ok: true, line: `nix probe: last sample ${Math.floor(age)} min ago was blind (target and control both failed), Nix state unknown` };
  return { key: 'nix-probe', ok: true, line: `nix probe: last sample ${Math.floor(age)} min ago, Nix up` };
}

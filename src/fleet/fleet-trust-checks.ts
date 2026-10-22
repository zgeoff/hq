import { checkFolderTrust } from '../trust/check-folder-trust.ts';
import { declaredFleet } from './declared-fleet.ts';
import type { FleetEntry } from './types.ts';

// For hq health: every folder the fleet spawns in must be trusted, or a respawn hangs.
export function fleetTrustChecks(fleet: FleetEntry[] = declaredFleet()): { key: string; ok: boolean; line: string }[] {
  return [...new Set(fleet.map((e) => e.cwd))].map((cwd) => {
    const t = checkFolderTrust(cwd);
    const who = fleet.filter((e) => e.cwd === cwd).map((e) => e.name).join(', ');
    return { key: `fleet-trust:${cwd}`, ok: t.trusted, line: t.trusted ? `fleet folder ${cwd} is trusted (${who})` : `fleet folder: ${t.why} (respawns of ${who} would hang)` };
  });
}

import { SCHEDULED_ROLES } from './scheduled-roles.ts';
import type { FleetEntry, FleetSession } from './types.ts';

// The live sessions of the fleet entries that hold a scheduled role, by name.
export function collectScheduledSessions(fleet: FleetEntry[], sessions: Record<string, FleetSession>): Record<string, FleetSession> {
  const scheduled: Record<string, FleetSession> = {};
  for (const entry of fleet) {
    const session = sessions[entry.name];
    if (session && entry.roles?.some((role) => SCHEDULED_ROLES.includes(role)) === true) {
      scheduled[entry.name] = session;
    }
  }
  return scheduled;
}

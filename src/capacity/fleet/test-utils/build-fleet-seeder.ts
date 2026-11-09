import { seedSlotUsage } from './seed-slot-usage.ts';
import type { FleetDeps } from './types.ts';

export function buildFleetSeeder(deps: FleetDeps) {
  return {
    slotUsage: (input?: Parameters<typeof seedSlotUsage>[1]) => seedSlotUsage(deps, input),
  };
}

import type { LaneConfig } from '../areas/types.ts';
import type { CapacitySettings } from '../capacity/types.ts';

export interface LanePlan {
  slots: number;
  mib: number;
  vcpus: number;
  maxMib: number;
  maxVcpus: number;
  overMib: boolean;
  overVcpus: boolean;
}

// What the imp lanes would take from impd with every slot full: each slot costs impMib and
// impVcpus, against impd's non-Nix lines. The room left is for imps outside the lanes, such as
// z-qa checks and helpers. Being at a line is not over it.
export function buildLanePlan(lanes: readonly LaneConfig[], impMib: number, settings: CapacitySettings): LanePlan {
  const imp = lanes.filter((lane) => lane.place === 'imp').reduce((sum, lane) => sum + lane.size, 0),
    mib = imp * impMib,
    vcpus = imp * settings.impVcpus;
  return { slots: imp, mib, vcpus, maxMib: settings.nonnixMaxMib, maxVcpus: settings.nonnixMaxVcpus, overMib: mib > settings.nonnixMaxMib, overVcpus: vcpus > settings.nonnixMaxVcpus };
}

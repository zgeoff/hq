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

export function buildLanePlan(imp: number, impMib: number, settings: CapacitySettings): LanePlan {
  const mib = imp * impMib;
  const vcpus = imp * settings.impVcpus;
  return { slots: imp, mib, vcpus, maxMib: settings.nonnixMaxMib, maxVcpus: settings.nonnixMaxVcpus, overMib: mib > settings.nonnixMaxMib, overVcpus: vcpus > settings.nonnixMaxVcpus };
}

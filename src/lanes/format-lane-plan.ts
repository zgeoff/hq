import type { LanePlan } from './build-lane-plan.ts';

export function formatLanePlan(plan: LanePlan): string {
  const take = `imp lane plan: ${plan.slots} slot(s), all full, take ${plan.mib}/${plan.maxMib} MiB and ${plan.vcpus}/${plan.maxVcpus} vCPUs`;
  if (plan.overMib || plan.overVcpus) {
    return `${take}: over impd's non-Nix line; shrink the imp lanes in pacing.json or raise the line`;
  }
  return `${take}; ${plan.maxMib - plan.mib} MiB and ${plan.maxVcpus - plan.vcpus} vCPUs left for imps outside the lanes`;
}

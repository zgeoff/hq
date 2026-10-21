import type { LanePlan } from './build-lane-plan.ts';

// The `hq lanes` line for the imp lanes' plan: what their slots take from impd with all full, and
// the room that leaves for imps outside the lanes, or a warning when it crosses a line.
export function formatLanePlan(plan: LanePlan): string {
  const take = `imp lane plan: ${plan.slots} slot(s), all full, take ${plan.mib}/${plan.maxMib} MiB and ${plan.vcpus}/${plan.maxVcpus} vCPUs`;
  if (plan.overMib || plan.overVcpus) {
    return `${take}: over impd's non-Nix line; shrink the imp lanes in pacing.json or raise the line`;
  }
  return `${take}; ${plan.maxMib - plan.mib} MiB and ${plan.maxVcpus - plan.vcpus} vCPUs left for imps outside the lanes`;
}

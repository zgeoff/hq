import type { LanePlan } from './build-lane-plan.ts';

export function formatPlanOverage(plan: LanePlan): string | null {
  const MIB_PER_GIB = 1024,
    parts = [plan.overMib ? `${Math.round(plan.mib / MIB_PER_GIB)}/${Math.round(plan.maxMib / MIB_PER_GIB)} GiB` : null, plan.overVcpus ? `${plan.vcpus}/${plan.maxVcpus} vCPU` : null].filter((part) => part !== null);
  return parts.length === 0 ? null : `plan ${parts.join(', ')}`;
}

import { out } from '../health/out.ts';
import { formatError as msg } from './format-error.ts';
import { getReadMS as readMs } from './get-read-ms.ts';
import type { CapacityProbe, Impd } from './types.ts';

export async function readImpd(probe: CapacityProbe): Promise<{ impd: Impd; error: string | null }> {
  const impd: Impd = { budgetMib: null, usedMib: null, committedMib: null, nonnixAwakeMib: null, nonnixAwakeVcpus: null, nixAwakeMib: null, priorityKeptMib: null };
  const errors: string[] = [];
  const [info, ls] = await Promise.all([out(probe.run, ['impz', 'info', '--json'], readMs(probe)), out(probe.run, ['impz', 'ls', '--json'], readMs(probe))]);
  try {
    if (info === null) throw new Error('impz info failed or timed out');
    const j = JSON.parse(info) as Record<string, unknown>;
    impd.budgetMib = num(j['ramBudgetMib']);
    impd.usedMib = num(j['ramUsedMib']);
    impd.committedMib = num(j['ramCommittedMib']);
    impd.priorityKeptMib = parseKeptMib(j['ramPriorityKeptMib']);
    if (impd.budgetMib === null || impd.usedMib === null) throw new Error('impz info has no ramBudgetMib or ramUsedMib');
  } catch (e) {
    Object.assign(impd, { budgetMib: null, usedMib: null, committedMib: null, priorityKeptMib: null });
    errors.push(msg(e));
  }
  try {
    if (ls === null) throw new Error('impz ls failed or timed out');
    const j = JSON.parse(ls) as unknown;
    if (!Array.isArray(j)) throw new Error('impz ls did not print a list');
    let [nonnix, nix] = [0, 0];
    for (const i of j as { name?: unknown; state?: unknown; memoryMib?: unknown; pluggedMib?: unknown }[]) {
      if (i?.state !== 'running') continue;
      const base = num(i.memoryMib);
      if (base === null || typeof i.name !== 'string') throw new Error('an awake imp has no name or memoryMib');
      const mib = base + (num(i.pluggedMib) ?? 0); // elastic imps add plugged RAM on top of the boot allocation
      if (i.name.startsWith('nixie-')) nix += mib;
      else nonnix += mib;
    }
    impd.nonnixAwakeMib = nonnix;
    impd.nixAwakeMib = nix;
    impd.nonnixAwakeVcpus = countNonnixVcpus(j as { name?: unknown; state?: unknown; vcpus?: unknown }[]);
  } catch (e) {
    errors.push(msg(e));
  }
  return { impd, error: errors.length ? errors.join('; ') : null };
}

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x) : null);

// impd releases from before the priority reservation print no ramPriorityKeptMib, and keep no RAM.
function parseKeptMib(field: unknown): number {
  if (field === undefined) {
    return 0;
  }
  const keptMib = num(field);
  if (keptMib === null) {
    throw new Error('impz info has a ramPriorityKeptMib that is not a number');
  }
  return keptMib;
}

// An awake imp that reports no vCPUs makes the count unknown, rather than a count too low.
function countNonnixVcpus(imps: readonly { name?: unknown; state?: unknown; vcpus?: unknown }[]): number | null {
  let total = 0;
  for (const i of imps) {
    if (i.state !== 'running' || (typeof i.name === 'string' && i.name.startsWith('nixie-'))) {
      continue;
    }
    const vcpus = num(i.vcpus);
    if (vcpus === null) {
      return null;
    }
    total += vcpus;
  }
  return total;
}

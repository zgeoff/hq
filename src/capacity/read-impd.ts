import { out } from '../health/out.ts';
import { formatError as msg } from './format-error.ts';
import { getReadMS as readMs } from './get-read-ms.ts';
import type { CapacityProbe, Impd } from './types.ts';

// impz info and impz ls: the daemon's RAM budget, and the memory of the imps awake now, split into
// the Nix imps (named nixie-*) and the rest. Decision 16's lanes can reuse this later.
export async function readImpd(probe: CapacityProbe): Promise<{ impd: Impd; error: string | null }> {
  const impd: Impd = { budgetMib: null, usedMib: null, committedMib: null, nonnixAwakeMib: null, nonnixAwakeVcpus: null, nixAwakeMib: null };
  const errors: string[] = [];
  const [info, ls] = await Promise.all([out(probe.run, ['impz', 'info', '--json'], readMs(probe)), out(probe.run, ['impz', 'ls', '--json'], readMs(probe))]);
  try {
    if (info === null) throw new Error('impz info failed or timed out');
    const j = JSON.parse(info) as Record<string, unknown>;
    impd.budgetMib = num(j['ramBudgetMib']);
    impd.usedMib = num(j['ramUsedMib']);
    impd.committedMib = num(j['ramCommittedMib']);
    if (impd.budgetMib === null || impd.usedMib === null) throw new Error('impz info has no ramBudgetMib or ramUsedMib');
  } catch (e) {
    Object.assign(impd, { budgetMib: null, usedMib: null, committedMib: null });
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

// The vCPUs of the awake non-Nix imps, for the lanes' vCPU line. An awake imp that reports none
// makes the count unknown, which holds every lane slot, rather than a count too low.
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

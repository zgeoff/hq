import { z } from 'zod';
import { out } from '../health/out.ts';
import { formatError as msg } from './format-error.ts';
import { getReadMS as readMs } from './get-read-ms.ts';
import type { CapacityProbe, Impd } from './types.ts';

const InfoSchema = z.record(z.string(), z.unknown());
const ImpListSchema = z.array(z.unknown());

export async function readImpd(probe: Pick<CapacityProbe, 'run' | 'readMs'>): Promise<{ impd: Impd; error: string | null }> {
  const impd: Impd = { budgetMib: null, usedMib: null, committedMib: null, nonnixAwakeMib: null, nonnixAwakeVcpus: null, nixAwakeMib: null, priorityKeptMib: null };
  const errors: string[] = [];
  const [info, ls] = await Promise.all([out(probe.run, ['impz', 'info', '--json'], readMs(probe)), out(probe.run, ['impz', 'ls', '--json'], readMs(probe))]);
  try {
    if (info === null) throw new Error('impz info failed or timed out');
    const parsedInfo = InfoSchema.safeParse(JSON.parse(info));
    if (!parsedInfo.success) {
      throw new Error('impz info did not print an object');
    }
    const fields = parsedInfo.data;
    impd.budgetMib = num(fields['ramBudgetMib']);
    impd.usedMib = num(fields['ramUsedMib']);
    impd.committedMib = num(fields['ramCommittedMib']);
    impd.priorityKeptMib = parseKeptMib(fields['ramPriorityKeptMib']);
    if (impd.budgetMib === null || impd.usedMib === null) throw new Error('impz info has no ramBudgetMib or ramUsedMib');
  } catch (e) {
    Object.assign(impd, { budgetMib: null, usedMib: null, committedMib: null, priorityKeptMib: null });
    errors.push(msg(e));
  }
  try {
    if (ls === null) throw new Error('impz ls failed or timed out');
    const parsedList = ImpListSchema.safeParse(JSON.parse(ls));
    if (!parsedList.success) {
      throw new Error('impz ls did not print a list');
    }
    const imps = parsedList.data.map(toImpEntry);
    let [nonnix, nix] = [0, 0];
    for (const imp of imps) {
      if (imp.state !== 'running') {
        continue;
      }
      const base = num(imp.memoryMib);
      if (base === null || typeof imp.name !== 'string') {
        throw new Error('an awake imp has no name or memoryMib');
      }

      // Elastic imps add plugged RAM on top of the boot allocation.
      const mib = base + (num(imp.pluggedMib) ?? 0);
      if (imp.name.startsWith('nixie-')) {
        nix += mib;
      } else {
        nonnix += mib;
      }
    }
    impd.nonnixAwakeMib = nonnix;
    impd.nixAwakeMib = nix;
    impd.nonnixAwakeVcpus = countNonnixVcpus(imps);
  } catch (e) {
    errors.push(msg(e));
  }
  return { impd, error: errors.length ? errors.join('; ') : null };
}

const ImpSchema = z.object({ name: z.unknown().optional(), state: z.unknown().optional(), memoryMib: z.unknown().optional(), pluggedMib: z.unknown().optional(), vcpus: z.unknown().optional() });

type ImpEntry = z.output<typeof ImpSchema>;

// An entry that is not an object reads as an imp that is not running.
function toImpEntry(entry: unknown): ImpEntry {
  const imp = ImpSchema.safeParse(entry);
  return imp.success ? imp.data : { name: undefined, state: undefined, memoryMib: undefined, pluggedMib: undefined, vcpus: undefined };
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
function countNonnixVcpus(imps: readonly ImpEntry[]): number | null {
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

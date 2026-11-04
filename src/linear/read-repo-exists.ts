import type { Runner } from '../runner/types.ts';
import { pickRepoProbes } from './pick-repo-probes.ts';
import { probeRepo } from './probe-repo.ts';

export async function readRepoExists(run: Runner, names: readonly string[], stored: Readonly<Record<string, boolean>>): Promise<Record<string, boolean>> {
  const picked = pickRepoProbes(names, stored);
  const found = await Promise.all(picked.probes.map(async (probe) => [probe.name, await probeRepo(run, probe.repo)] as const));
  return { ...picked.known, ...Object.fromEntries(found) };
}

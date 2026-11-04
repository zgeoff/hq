import { pickAreaRepo } from '../brief/area-repos.ts';
import type { Runner } from '../runner/types.ts';
import { probeRepo } from './probe-repo.ts';

// A label already checked, found or not, is not asked about again.
export async function readRepoExists(run: Runner, names: readonly string[], known: Readonly<Record<string, boolean>>): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    names.flatMap((name) => {
      const repo = pickAreaRepo(name);
      if (repo === null) {
        return [];
      }
      const stored = known[name];
      return [stored === undefined ? probeRepo(run, repo).then((exists) => [name, exists] as const) : Promise.resolve([name, stored] as const)];
    }),
  );
  return Object.fromEntries(entries);
}

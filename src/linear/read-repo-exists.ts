import { pickAreaRepo } from '../brief/area-repos.ts';
import type { Runner } from '../runner/types.ts';
import { probeRepo } from './probe-repo.ts';

// A label already found to have its repo is not asked about again; one found without it is, so a repo made since shows.
export async function readRepoExists(run: Runner, names: readonly string[], known: Readonly<Record<string, boolean>>): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    names.flatMap((name) => {
      const repo = pickAreaRepo(name);
      if (repo === null) {
        return [];
      }
      return [known[name] === true ? Promise.resolve([name, true] as const) : probeRepo(run, repo).then((exists) => [name, exists] as const)];
    }),
  );
  return Object.fromEntries(entries);
}

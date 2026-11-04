import { pickAreaRepo } from '../brief/area-repos.ts';

export interface RepoProbes {
  known: Record<string, boolean>;
  probes: { name: string; repo: string }[];
}

// A label already checked, found or not, is not asked about again.
export function pickRepoProbes(names: readonly string[], stored: Readonly<Record<string, boolean>>): RepoProbes {
  const known: Record<string, boolean> = {};
  const probes: RepoProbes['probes'] = [];
  for (const name of names) {
    const repo = pickAreaRepo(name);
    const found = stored[name];
    if (repo === null) {
      continue;
    }
    if (found === undefined) {
      probes.push({ name, repo });
    } else {
      known[name] = found;
    }
  }
  return { known, probes };
}

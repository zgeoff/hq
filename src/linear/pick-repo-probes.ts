import { pickAreaRepo } from '../brief/area-repos.ts';

export interface RepoProbes {
  known: Record<string, boolean>;
  probes: { name: string; repo: string }[];
}

// Only a repo already found is not asked about again; a missing one may have been made since.
export function pickRepoProbes(names: readonly string[], stored: Readonly<Record<string, boolean>>): RepoProbes {
  const known: Record<string, boolean> = {};
  const probes: RepoProbes['probes'] = [];
  for (const name of names) {
    const repo = pickAreaRepo(name);
    const found = stored[name];
    if (repo === null) {
      continue;
    }
    if (found === true) {
      known[name] = true;
    } else {
      probes.push({ name, repo });
    }
  }
  return { known, probes };
}

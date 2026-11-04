import type { StoredAreaLabels } from '../focus/area-labels-schema.ts';

export interface LinearAreasPlan {
  store: StoredAreaLabels | null;
  missing: string[];
}

export interface LinearAreasRead {
  team: string;
  lanesTeam: string;
  names: string[];
  repoExists: Record<string, boolean>;
  at: string;
}

// The stored list serves the team lanes reads; another team's labels are checked but not stored.
export function planLinearAreas(read: LinearAreasRead): LinearAreasPlan {
  return {
    store: read.team === read.lanesTeam ? { at: read.at, names: read.names, repoExists: read.repoExists } : null,
    missing: read.names.filter((name) => read.repoExists[name] === false),
  };
}

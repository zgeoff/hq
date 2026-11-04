import type { StoredAreaLabels } from '../focus/area-labels-schema.ts';

export interface LinearAreasPlan {
  store: StoredAreaLabels | null;
  missing: string[];
}

// The stored list serves the team lanes reads; another team's labels are checked but not stored.
export function planLinearAreas(team: string, lanesTeam: string, names: string[], repoExists: Record<string, boolean>, at: string): LinearAreasPlan {
  return {
    store: team === lanesTeam ? { at, names, repoExists } : null,
    missing: names.filter((name) => repoExists[name] === false),
  };
}

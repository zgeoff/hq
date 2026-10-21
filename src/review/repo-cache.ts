import { config } from '../config/config.ts';

// Where hq keeps its own clones of repos with no checkout under ~/projects.
export function repoCache(): string {
  return config().HQ_REPOS ?? `${process.env['HOME']}/.local/share/z-sessions/repos`;
}

import type { Database } from 'bun:sqlite';
import { probeFinalAnswered } from './probe-final-answered.ts';
import type { RunPr } from './types.ts';

// A design pass's PRs are not the build run's work, so they hand nothing in.
export function probeHandedIn(db: Database, prs: readonly RunPr[]): boolean {
  const open = prs.filter((pr) => pr.state === 'open' && pr.design_pass === 0);
  return open.length > 0 && open.every((pr) => pr.final_sha && probeFinalAnswered(db, pr));
}

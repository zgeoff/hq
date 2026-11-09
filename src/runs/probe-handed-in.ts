import type { Database } from 'bun:sqlite';
import { probeFinalAnswered } from './probe-final-answered.ts';
import type { RunPR } from './types.ts';

export function probeHandedIn(db: Database, prs: readonly RunPR[]): boolean {
  const open = prs.filter((pr) => pr.state === 'open' && pr.design_pass === 0);
  return open.length > 0 && open.every((pr) => pr.final_sha && probeFinalAnswered(db, pr));
}

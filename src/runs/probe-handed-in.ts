import type { Database } from 'bun:sqlite';
import { probeFinalAnswered } from './probe-final-answered.ts';
import type { RunPr } from './types.ts';

export function probeHandedIn(db: Database, prs: readonly RunPr[]): boolean {
  const open = prs.filter((pr) => pr.state === 'open');
  return open.length > 0 && open.every((pr) => pr.final_sha && probeFinalAnswered(db, pr));
}

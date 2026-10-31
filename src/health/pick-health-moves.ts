import type { z } from 'zod';
import type { OPEN } from './open.ts';
import type { Check, CheckOwner } from './types.ts';

export type OpenProblems = z.infer<typeof OPEN>;

// How long the session that owns a problem has to fix it before hq tells the owner's session.
export const OWNER_FIX_MS = 2 * 60 * 60 * 1000;

// One move of one health problem in a watcher step, and what hq says about it.
export type HealthMove =
  | { action: 'reported'; key: string; line: string }
  | { action: 'asked'; key: string; line: string; owner: CheckOwner }
  | { action: 'escalated'; key: string; line: string; asked: string; since: string }
  | { action: 'cleared'; key: string; line: string; since: string };

// Decide each problem's move from the open problems and this step's checks: a new problem no session
// owns is reported, a new owned one is asked of its owner, an asked one still failing OWNER_FIX_MS
// later is escalated, and an open one whose check passes is cleared, unless its read was unknown.
export function pickHealthMoves(open: OpenProblems, checks: Check[], unknown: string[], at: string): HealthMove[] {
  const bad = checks.filter((check) => !check.ok);
  const moves: HealthMove[] = [];
  for (const [key, entry] of Object.entries(open)) {
    if (!bad.some((check) => check.key === key) && !unknown.some((prefix) => key.startsWith(prefix))) {
      moves.push({ action: 'cleared', key, line: entry.line, since: entry.since });
    }
  }
  for (const check of bad) {
    const entry = open[check.key];
    if (entry === undefined) {
      const opened: HealthMove = check.owner === undefined ? { action: 'reported', key: check.key, line: check.line } : { action: 'asked', key: check.key, line: check.line, owner: check.owner };
      moves.push(opened);
      continue;
    }
    if (entry.asked !== undefined && entry.escalated !== true && Date.parse(at) - Date.parse(entry.since) >= OWNER_FIX_MS) {
      moves.push({ action: 'escalated', key: check.key, line: check.line, asked: entry.asked, since: entry.since });
    }
  }
  return moves;
}

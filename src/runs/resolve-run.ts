import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { HqError } from '../errors.ts';
import { getRun } from './get-run.ts';
import type { Run } from './types.ts';

const MatchesSchema = z.array(z.object({ issue: z.string(), design_pass: z.number() }));

// A row by issue, or by one of its sessions (full id or 8-character prefix). A session of the design
// pass the run turned from changes nothing on the build run, so only a reader passes 'allow' for one.
export function resolveRun(db: Database, key: string, designPass: 'allow' | 'refuse' = 'refuse'): Run {
  const byIssue = getRun(db, key);
  if (byIssue) return byIssue;
  const matches = MatchesSchema.parse(db.query('SELECT DISTINCT issue, design_pass FROM run_sessions WHERE session_id = ? OR substr(session_id, 1, 8) = ?').all(key, key));
  const issues = [...new Set(matches.map((match) => match.issue))];
  if (issues.length > 1) {
    throw new HqError('ambiguous', `${key} matches sessions on ${issues.join(', ')}`);
  }
  const [issue] = issues;
  const run = issue === undefined ? null : getRun(db, issue);
  if (issue === undefined || run === null) {
    throw new HqError('not_found', `no run for ${key} (issue or session)`);
  }
  if (designPass === 'refuse' && matches.every((match) => match.design_pass === 1)) {
    throw new HqError('bad_state', `${key} is a session of ${issue}'s design pass, which became the build run: name ${issue} to change the build run`);
  }
  return run;
}

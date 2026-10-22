import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { reportLaneReady } from '../areas/report-lane-ready.ts';
import { RUNNING } from '../areas/running.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { getIssueAreas } from '../focus/get-issue-areas.ts';
import { ISSUE } from '../followups/issue.ts';
import type { LinearCall } from '../linear/types.ts';
import { readIssueVerdicts } from '../unblock/read-issue-verdicts.ts';
import { buildReadySnapshot } from './build-ready-snapshot.ts';
import { classifyReady } from './classify-ready.ts';
import { isSkipActive } from './is-skip-active.ts';
import { ISSUE_AREAS_KEY } from './issue-areas-key.ts';
import { readLaneSkips } from './read-lane-skips.ts';
import { READY_ISSUES_KEY } from './read-ready-snapshot.ts';
import { readTeamIssues } from './read-team-issues.ts';
import { removeEndedSkips } from './remove-ended-skips.ts';
import type { LaneRules, ReadyIssue } from './types.ts';

const MAX_SKIPPED = 100;

// Reads every Ready issue of the team, page by page, then reports the counts per lane and keeps the
// issues for the focus plan, in one write. A failure on any page throws before anything is written,
// so the last counts and issues stay as they were. The same write drops the skips that ended; a skip
// whose until issue Linear could not read stays.
export async function readLinearReady(db: Database, call: LinearCall, actor: string, rules: LaneRules): Promise<void> {
  const settled = await readSettledIssues(db, call);
  const issues = await readTeamIssues(call, rules.team, rules.readyState);
  const at = now();
  const snapshot = buildReadySnapshot(issues, rules, iso(at));
  db.transaction(() => {
    removeEndedSkips(db, settled, actor, at);
    const classified = classifyReady(issues, rules, readLaneSkips(db).filter((skip) => isSkipActive(skip, at)));
    const skipped = classified.skipped.slice(0, MAX_SKIPPED);

    // The summary counts every Ready issue past the eligible and the listed skipped as unexplained, so
    // the skipped issues cut from the list leave the total too.
    const total = classified.total - (classified.skipped.length - skipped.length);
    reportLaneReady(db, classified.counts, actor, { total, skipped, logOnlyChanges: true });
    setMeta(db, READY_ISSUES_KEY, JSON.stringify(snapshot));
    writeIssueAreas(db, [...snapshot.eligible, ...snapshot.design]);
  }).immediate();
}

// The until issues Linear reads Done or Canceled. A batch Linear fails to answer comes back failed,
// not thrown, and its issues stay unsettled. It reads before Ready, so a call the caller's deadline
// aborts here still fails the Ready read and nothing is written.
async function readSettledIssues(db: Database, call: LinearCall): Promise<Set<string>> {
  const waited = [...new Set(readLaneSkips(db).map((skip) => skip.until).filter((until) => ISSUE.test(until)))];
  if (waited.length === 0) {
    return new Set();
  }
  const verdicts = await readIssueVerdicts(call, waited);
  return new Set(waited.filter((issue) => verdicts.get(issue)?.kind === 'settled'));
}

const AREAS_SCHEMA = z.record(z.string(), z.array(z.string()));

// A run started from Ready leaves Ready, so its areas come from the read that last saw it. Entries
// for issues neither Ready nor running are dropped.
function writeIssueAreas(db: Database, issues: readonly ReadyIssue[]): void {
  const previous = metaJson(db, ISSUE_AREAS_KEY, AREAS_SCHEMA, {});
  const rows = z.array(z.object({ issue: z.string() })).parse(db.query(`SELECT issue FROM runs WHERE state IN (${RUNNING.map(() => '?').join(', ')})`).all(...RUNNING));
  const running = new Set(rows.map((row) => row.issue));
  const kept = Object.entries(previous).filter(([issue]) => running.has(issue));
  const areas = Object.fromEntries([...kept, ...issues.map((issue) => [issue.identifier, getIssueAreas(issue.labels)] as const)]);
  setMeta(db, ISSUE_AREAS_KEY, JSON.stringify(areas));
}

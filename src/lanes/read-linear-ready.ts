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
import type { Runner } from '../runner/types.ts';
import { readGitHubPR } from '../runs/read-github-pr.ts';
import type { LinearCall } from '../linear/types.ts';
import { readIssueVerdicts } from '../unblock/read-issue-verdicts.ts';
import type { ConditionVerdict } from '../unblock/types.ts';
import { buildReadySnapshot } from './build-ready-snapshot.ts';
import { classifyReady } from './classify-ready.ts';
import { isSkipActive } from './is-skip-active.ts';
import { ISSUE_AREAS_KEY } from './issue-areas-key.ts';
import { parsePRUntil } from './pr-until.ts';
import { readLaneSkips } from './read-lane-skips.ts';
import { READY_ISSUES_KEY } from './ready-issues-key.ts';
import { SKIP_UNREAD_KEY } from './skip-unread-key.ts';
import { readTeamIssues } from './read-team-issues.ts';
import { removeEndedSkips } from './remove-ended-skips.ts';
import type { LaneRules, ReadyIssue } from './types.ts';

const MAX_SKIPPED = 100;

interface LinearReadyDeps {
  call: LinearCall;
  run: Runner;
  actor: string;
  rules: LaneRules;
}

// Reads every Ready issue of the team, page by page, then reports the counts per lane and keeps the
// issues for the focus plan, in one write. A failure on any page throws before anything is written,
// so the last counts and issues stay as they were. The same write drops the skips that ended; a skip
// whose until issue Linear or until PR GitHub could not read stays, and the issue is kept with why for
// hq lanes skip list.
export async function readLinearReady(db: Database, deps: LinearReadyDeps): Promise<void> {
  const untils = await readUntils(db, deps.call, deps.run);
  const issues = await readTeamIssues(deps.call, deps.rules.team, deps.rules.readyState);
  const at = now();
  const snapshot = buildReadySnapshot(issues, deps.rules, iso(at));
  db.transaction(() => {
    removeEndedSkips(db, untils.settled, deps.actor, at);
    setMeta(db, SKIP_UNREAD_KEY, JSON.stringify(untils.unread));
    const classified = classifyReady(issues, deps.rules, readLaneSkips(db).filter((skip) => isSkipActive(skip, at)));
    const skipped = classified.skipped.slice(0, MAX_SKIPPED);

    // The summary counts every Ready issue past the eligible and the listed skipped as unexplained, so
    // the skipped issues cut from the list leave the total too.
    const total = classified.total - (classified.skipped.length - skipped.length);
    reportLaneReady(db, classified.counts, deps.actor, { total, skipped, logOnlyChanges: true });
    setMeta(db, READY_ISSUES_KEY, JSON.stringify(snapshot));
    writeIssueAreas(db, [...snapshot.eligible, ...snapshot.design]);
  }).immediate();
}

interface Untils {
  settled: Set<string>;
  unread: Record<string, string>;
}

// The until issues Linear reads Done or Canceled and the until PRs GitHub shows merged or closed, and
// those it could not read with why; a failed read is not thrown. It reads before Ready, so a call the
// caller's deadline aborts here still fails the Ready read and nothing is written.
async function readUntils(db: Database, call: LinearCall, run: Runner): Promise<Untils> {
  const untils = [...new Set(readLaneSkips(db).map((skip) => skip.until))];
  const [issues, prs] = await Promise.all([readUntilIssues(call, untils.filter((until) => ISSUE.test(until))), readUntilPRs(run, untils)]);
  return { settled: new Set([...issues.settled, ...prs.settled]), unread: { ...issues.unread, ...prs.unread } };
}

async function readUntilIssues(call: LinearCall, waited: readonly string[]): Promise<Untils> {
  if (waited.length === 0) {
    return { settled: new Set(), unread: {} };
  }
  const verdicts = await readIssueVerdicts(call, [...waited]);
  const settled = new Set(waited.filter((issue) => verdicts.get(issue)?.kind === 'settled'));
  const unread = Object.fromEntries(waited.flatMap((issue) => collectFailure(issue, verdicts.get(issue))));
  return { settled, unread };
}

async function readUntilPRs(run: Runner, untils: readonly string[]): Promise<Untils> {
  const waited = untils.flatMap((until) => {
    const pr = parsePRUntil(until);
    return pr === null ? [] : [{ until, ref: pr.ref }];
  });
  const answers = await Promise.all(waited.map(async (pr) => ({ until: pr.until, answer: await readGitHubPR(run, pr.ref) })));
  const settled = new Set(answers.filter((read) => 'state' in read.answer && read.answer.state !== 'OPEN').map((read) => read.until));
  const unread = Object.fromEntries(answers.flatMap((read) => ('error' in read.answer ? [[read.until, read.answer.error]] : [])));
  return { settled, unread };
}

function collectFailure(issue: string, verdict: ConditionVerdict | undefined): [string, string][] {
  return verdict?.kind === 'failed' ? [[issue, verdict.error]] : [];
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

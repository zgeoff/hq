import { toExactOptional } from '@zgeoff/std';
import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import type { RunOpts, Runner } from '../runner/types.ts';
import { recordUmbrellaBox } from '../linear/umbrella-boxes.ts';
import { isInScope as inScope } from '../scope/is-in-scope.ts';
import { contributedIssues } from './contributed-issues.ts';
import { issueOf } from './issue-of.ts';
import { kindOf } from './kind-of.ts';
import { toUTCDay as utcDay } from './to-utc-day.ts';

const CAP = 1000; // gh search's most results per query: a full day means rows are missing

interface GhPr {
  number: number;
  title: string;
  body?: string | null;
  closedAt: string;
  repository: { name: string };
}

// One UTC day of merges, stored. A past day is recorded as done and never fetched again.
export async function syncDay(db: Database, run: Runner, day: string, env?: RunOpts['env'], at: Date = now()): Promise<number> {
  const r = await run(['gh', 'search', 'prs', '--owner', 'zgeoff', '--merged', '--merged-at', `${day}T00:00:00Z..${day}T23:59:59Z`, '--json', 'repository,number,title,body,closedAt', '--limit', String(CAP)], toExactOptional({ env }));
  if (r.code !== 0) throw new HqError('command_failed', `gh search prs for ${day} failed (${r.code}): ${(r.stderr || r.stdout).trim().slice(0, 200)}`);
  const raw = JSON.parse(r.stdout) as unknown;
  if (!Array.isArray(raw)) throw new HqError('command_failed', `gh search prs for ${day} did not return a list`);
  const all = raw as GhPr[];
  if (all.length >= CAP) throw new HqError('too_many', `${day} has ${CAP}+ merged PRs, more than one search returns; not recorded`);
  // A merge time is an ISO instant inside the day asked for; a repo name is GitHub's.
  const inDay = (t: unknown) => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(t) && t.slice(0, 10) === day;
  const bad = all.find((p) => !Number.isSafeInteger(p?.number) || p.number < 1 || typeof p.title !== 'string' || !inDay(p.closedAt) || typeof p.repository?.name !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(p.repository.name) || /^\.+$/.test(p.repository.name));
  if (bad) throw new HqError('command_failed', `gh search prs for ${day} returned a row hq can't read; not recorded`);
  const rows = all.filter((p) => inScope(p.repository.name));
  const done = utcDay(at.getTime()) > day;
  db.transaction(() => {
    const up = db.query(`INSERT INTO merged_prs (repo, number, merged_at, title, kind, issue) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (repo, number) DO UPDATE SET merged_at = excluded.merged_at, title = excluded.title, kind = excluded.kind, issue = excluded.issue`);
    for (const pr of rows) {
      up.run(pr.repository.name, pr.number, pr.closedAt, pr.title, kindOf(pr.title), issueOf(pr.body));
      for (const issue of contributedIssues(pr.body)) {
        recordUmbrellaBox(db, pr.repository.name, pr.number, issue, pr.closedAt);
      }
    }
    if (done) db.query('INSERT INTO merged_pr_days (day, n, at) VALUES (?, ?, ?) ON CONFLICT (day) DO UPDATE SET n = excluded.n, at = excluded.at').run(day, rows.length, iso(at));
  }).immediate();
  return rows.length;
}

import { toExactOptional } from '@zgeoff/std';
import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { recordUmbrellaBox } from '../linear/record-umbrella-box.ts';
import type { RunOpts, Runner } from '../runner/types.ts';
import { isInScope as inScope } from '../scope/is-in-scope.ts';
import { issueOf } from './issue-of.ts';
import { kindOf } from './kind-of.ts';
import { parseContributedIssues } from './parse-contributed-issues.ts';
import { toUTCDay as utcDay } from './to-utc-day.ts';
import { writeMergedPR } from './write-merged-pr.ts';
import { writeMergedPRDay } from './write-merged-pr-day.ts';

const CAP = 1000; // gh search's most results per query: a full day means rows are missing

export async function syncDay(db: Database, run: Runner, day: string, env?: RunOpts['env'], at: Date = now()): Promise<number> {
  const r = await run(['gh', 'search', 'prs', '--owner', 'zgeoff', '--merged', '--merged-at', `${day}T00:00:00Z..${day}T23:59:59Z`, '--json', 'repository,number,title,body,closedAt', '--limit', String(CAP)], toExactOptional({ env }));
  if (r.code !== 0) throw new HqError('command_failed', `gh search prs for ${day} failed (${r.code}): ${(r.stderr || r.stdout).trim().slice(0, 200)}`);
  const raw: unknown = JSON.parse(r.stdout);
  if (!Array.isArray(raw)) throw new HqError('command_failed', `gh search prs for ${day} did not return a list`);
  if (raw.length >= CAP) {
    throw new HqError('too_many', `${day} has ${CAP}+ merged PRs, more than one search returns; not recorded`);
  }
  const parsed = buildPRListSchema(day).safeParse(raw);
  if (!parsed.success) {
    throw new HqError('command_failed', `gh search prs for ${day} returned a row hq can't read; not recorded`);
  }
  const all = parsed.data;
  const rows = all.filter((p) => inScope(p.repository.name));
  const done = utcDay(at.getTime()) > day;
  db.transaction(() => {
    for (const pr of rows) {
      writeMergedPR(db, { repo: pr.repository.name, number: pr.number, merged_at: pr.closedAt, title: pr.title, kind: kindOf(pr.title), issue: issueOf(pr.body) });
      for (const issue of parseContributedIssues(pr.body)) {
        recordUmbrellaBox(db, { repo: pr.repository.name, number: pr.number, issue, mergedAt: pr.closedAt });
      }
    }
    if (done) {
      // oxlint-disable-next-line eslint/id-length -- n is the stored merged_pr_days column
      writeMergedPRDay(db, { day, n: rows.length, at: iso(at) });
    }
  }).immediate();
  return rows.length;
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;
const REPO_NAME = /^[A-Za-z0-9_.-]{1,100}$/u;
const ONLY_DOTS = /^\.+$/u;

function buildPRListSchema(day: string) {
  const repositoryName = z
    .string()
    .regex(REPO_NAME)
    .refine((name) => !ONLY_DOTS.test(name));
  const closedAt = z.string().refine((time) => TIMESTAMP.test(time) && time.startsWith(day));
  return z.array(z.object({ number: z.number().int().min(1), title: z.string(), body: z.string().nullish(), closedAt, repository: z.object({ name: repositoryName }) }));
}

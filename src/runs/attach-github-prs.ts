import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { cleanEnv } from '../runner/clean-env.ts';
import type { Runner } from '../runner/types.ts';
import { IN_SCOPE } from '../scope/in-scope.ts';
import { CLOSED_RUN_STATES } from '../transitions/closed-run-states.ts';
import { addPr } from './add-pr.ts';
import { GITHUB_ACTOR } from './github-actor.ts';
import { planAttachments } from './plan-attachments.ts';
import type { OpenPR } from './plan-attachments.ts';

interface Search {
  label: string;
  filter: string[];
}

export interface AttachResult {
  attached: string[];
  errors: string[];

  // Every repo's merged search answered in full, so no merged PR since mergedSince was missed.
  mergedSearched: boolean;
}

// A PR opened and merged between two passes never shows as open, so only the merged search finds it.
export async function attachGitHubPRs(db: Database, run: Runner, mergedSince: Date): Promise<AttachResult> {
  const searches: Search[] = [
    { label: 'open', filter: ['--state', 'open'] },
    { label: 'merged', filter: ['--merged-at', `>=${iso(mergedSince)}`] },
  ];
  const searched = await Promise.all(IN_SCOPE.flatMap((repo) => searches.map((search) => readRepoPRs(run, repo, search))));
  const mergedSearched = searched.filter((result) => result.label === 'merged').every((result) => result.complete);

  // A PR merged since the last pass may also show in the open search if GitHub's index lags.
  const prs = [...new Map(searched.flatMap((result) => result.prs).map((pr) => [`${pr.repo}#${pr.number}`, pr])).values()];
  const plan = planAttachments(prs, readAttachedRefs(db), readOpenRuns(db));
  const attached: string[] = [];

  const errors = [...searched.flatMap((result) => result.errors), ...plan.errors];
  for (const step of plan.attach) {
    const reason = tryAttach(db, step.issue, step.url);
    if (reason === null) {
      attached.push(`${step.ref} to ${step.issue}`);
    } else {
      errors.push(`${step.ref}: ${reason}`);
    }
  }
  return { attached, errors, mergedSearched };
}

// gh search prs answers at most 1000 a search, so each repo in scope gets its own.
const SEARCH_LIMIT = 1000;

interface RepoSearch {
  label: string;
  prs: OpenPR[];
  errors: string[];

  // The search answered and fit under its limit.
  complete: boolean;
}

async function readRepoPRs(run: Runner, repo: string, search: Search): Promise<RepoSearch> {
  const found = await run(['gh', 'search', 'prs', '--repo', `zgeoff/${repo}`, ...search.filter, '--json', 'number,repository,body', '--limit', String(SEARCH_LIMIT)], { env: cleanEnv() });
  if (found.code !== 0) {
    return { label: search.label, prs: [], errors: [`${search.label} PR search in ${repo} failed (gh exit ${found.code}): ${(found.stderr || found.stdout).trim().slice(0, 200)}`], complete: false };
  }
  const answer = readSearch(found.stdout);
  if (answer === null) {
    return { label: search.label, prs: [], errors: [`${search.label} PR search in ${repo} gave an unreadable answer`], complete: false };
  }
  const prs = answer.filter((pr) => pr.repository.name === repo).map((pr) => ({ repo, number: pr.number, body: pr.body ?? '' }));

  // A full answer may have cut PRs off, and those stay unattached until a search finds them.
  const complete = answer.length < SEARCH_LIMIT;
  const errors = complete ? [] : [`${search.label} PR search in ${repo} gave ${SEARCH_LIMIT} PRs, its limit, so PRs past it are not attached`];
  return { label: search.label, prs, errors, complete };
}

const REPOSITORY = z.object({ name: z.string() });
const PR = z.object({ number: z.number().int(), repository: REPOSITORY, body: z.string().nullable() });
const FOUND = z.array(PR);

function readSearch(stdout: string): z.infer<typeof FOUND> | null {
  try {
    return FOUND.parse(JSON.parse(stdout));
  } catch {
    return null;
  }
}

const REF_ROWS = z.array(z.object({ ref: z.string() }));

function readAttachedRefs(db: Database): Set<string> {
  return new Set(REF_ROWS.parse(db.query('SELECT ref FROM run_prs').all()).map((row) => row.ref));
}

const RUN_ROWS = z.array(z.object({ issue: z.string(), state: z.string() }));

function readOpenRuns(db: Database): Set<string> {
  const runs = RUN_ROWS.parse(db.query('SELECT issue, state FROM runs').all());
  return new Set(runs.filter((run) => !CLOSED_RUN_STATES.some((closed) => closed === run.state)).map((run) => run.issue));
}

// null when attached, else why not.
function tryAttach(db: Database, issue: string, url: string): string | null {
  try {
    addPr(db, issue, url, GITHUB_ACTOR);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

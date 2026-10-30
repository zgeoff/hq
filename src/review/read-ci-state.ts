import { toExactOptional } from '@zgeoff/std';
import { z } from 'zod';
import type { Runner } from '../runner/types.ts';
import { pickCountedChecks } from './pick-counted-checks.ts';
import type { CIState } from './types.ts';

// The PR's CI checks (after waiting for them, when asked) and its count of unresolved review
// threads: the part of a review that is the same whichever reviewer ran.
export async function readCIState(run: Runner, slug: string, pr: number, watch: boolean): Promise<CIState> {
  return { ...(await readChecks(run, slug, pr, watch)), openThreads: await readOpenThreads(run, slug, pr) };
}

const Checks = z.array(z.object({ name: z.string(), state: z.string(), bucket: z.string().optional(), workflow: z.string().optional(), link: z.string().optional(), startedAt: z.string().nullable().optional() }));

const PASSING_BUCKETS = new Set(['pass', 'skipping']);

// gh exits 1 with this on stderr, even with --json, for a PR that has no checks.
const NO_CHECKS = /no checks reported/u;

async function readChecks(run: Runner, slug: string, pr: number, watch: boolean): Promise<Pick<CIState, 'checks' | 'checksError'>> {
  if (watch) {
    await run(['gh', 'pr', 'checks', String(pr), '-R', slug, '--watch', '--interval', '30']);
  }
  const out = await run(['gh', 'pr', 'checks', String(pr), '-R', slug, '--json', 'name,state,bucket,workflow,link,startedAt']);
  if (out.code !== 0 && NO_CHECKS.test(out.stderr)) {
    return { checks: [], checksError: null };
  }
  const parsed = Checks.safeParse(parseJSONText(out.stdout));
  if (parsed.success) {
    const counted = pickCountedChecks(parsed.data, (check) => ({ workflow: check.workflow ?? '', name: check.name, url: check.link, startedAt: check.startedAt, cancelled: check.bucket === 'cancel', passing: PASSING_BUCKETS.has(check.bucket ?? '') }));
    return { checks: counted.map((check) => toExactOptional({ name: check.name, state: check.state, bucket: check.bucket })), checksError: null };
  }
  return { checks: [], checksError: `gh pr checks failed (${out.code}): ${(out.stderr || out.stdout).trim().slice(0, 300)}` };
}

function parseJSONText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function buildThreadQuery(slug: string, pr: number): string {
  const [owner, repo] = slug.split('/');
  return `{repository(owner:"${owner}",name:"${repo}"){pullRequest(number:${pr}){reviewThreads(first:100){nodes{isResolved}}}}}`;
}

async function readOpenThreads(run: Runner, slug: string, pr: number): Promise<number | null> {
  const query = buildThreadQuery(slug, pr),
    threads = await run(['gh', 'api', 'graphql', '-f', `query=${query}`, '--jq', '[.data.repository.pullRequest.reviewThreads.nodes[]|select(.isResolved|not)]|length']);
  return threads.code === 0 && /^\d+$/u.test(threads.stdout.trim()) ? Number(threads.stdout.trim()) : null;
}

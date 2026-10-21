import type { Runner } from '../runner/types.ts';
import type { CIState, ReviewResult } from './types.ts';

// The PR's CI checks (after waiting for them, when asked) and its count of unresolved review
// threads: the part of a review that is the same whichever reviewer ran.
export async function readCIState(run: Runner, slug: string, pr: number, watch: boolean): Promise<CIState> {
  return { checks: await readChecks(run, slug, pr, watch), openThreads: await readOpenThreads(run, slug, pr) };
}

async function readChecks(run: Runner, slug: string, pr: number, watch: boolean): Promise<ReviewResult['checks']> {
  if (watch) {
    await run(['gh', 'pr', 'checks', String(pr), '-R', slug, '--watch', '--interval', '30']);
  }
  const out = await run(['gh', 'pr', 'checks', String(pr), '-R', slug, '--json', 'name,state,bucket']);
  let checks: ReviewResult['checks'] = [];
  try {
    checks = JSON.parse(out.stdout) as ReviewResult['checks'];
  } catch {}
  return checks;
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

import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';
import { cleanEnv } from '../runner/clean-env.ts';
import { normalizePrRef } from './normalize-pr-ref.ts';

// `hq run merged` asks GitHub first (z-review, 2026-10-17): a `gh pr merge` that failed on a
// conflict once left a PR open on GitHub but merged in hq, and nothing could undo it.
export async function checkMergedOnGitHub(run: Runner, raw: string): Promise<void> {
  const { ref } = normalizePrRef(raw);
  const [repo, n] = ref.split('#') as [string, string];
  const r = await run(['gh', 'pr', 'view', n, '-R', `zgeoff/${repo}`, '--json', 'state,mergedAt'], { env: cleanEnv() });
  if (r.code !== 0) throw new HqError('github_unreachable', `can't confirm ${ref} merged on GitHub (gh exit ${r.code}): ${(r.stderr || r.stdout).trim().slice(0, 200)}; hq leaves it open`);
  let state: unknown;
  try {
    state = (JSON.parse(r.stdout) as { state?: unknown }).state;
  } catch {
    throw new HqError('github_unreachable', `gh gave no JSON for ${ref}; hq leaves it open`);
  }
  if (state !== 'MERGED') throw new HqError('not_merged', `${ref} is ${typeof state === 'string' ? state : 'unknown'} on GitHub, not merged; hq leaves it open`);
}

import type { Runner } from '../runner/types.ts';
import { buildHeadRef } from './build-head-ref.ts';
import { readCommitSha } from './read-commit-sha.ts';

// The full sha of the PR head hq last fetched into its own ref in `dir`; null when git cannot read it.
export async function findFetchedHead(run: Runner, dir: string, pr: number): Promise<string | null> {
  try {
    return await readCommitSha(run, dir, buildHeadRef(pr));
  } catch {
    return null;
  }
}

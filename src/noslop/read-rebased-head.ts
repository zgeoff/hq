import type { Runner } from '../runner/types.ts';
import { GitReadError } from './git-read-error.ts';
import { pickRebasedHead } from './pick-rebased-head.ts';
import type { ListedCommit, RebasedHead } from './pick-rebased-head.ts';
import { readPatchIDs } from './read-patch-ids.ts';

export interface RebasedHeadInput {
  run: Runner;
  dir: string;

  // The last lens-reviewed head, which the branch no longer holds.
  reviewed: string;

  // The PR's base as a ref, fetched fresh, and the PR's head now.
  base: string;
  head: string;

  // The base the review read, which the clone holds; null reads the reviewed commits from `base`.
  reviewBase: string | null;
}

// The branch commit a rebase made of the last lens-reviewed head, as noslop maps it. A lower stack
// layer's commits below the review's base had their own PR's review. Commits whose patch the base
// holds are left out too. Throws GitReadError when git cannot answer.
export async function readRebasedHead(input: RebasedHeadInput): Promise<RebasedHead> {
  const below = input.reviewBase === null ? [] : ['--not', input.reviewBase],
    branch = await readCommits(input, ['--first-parent', input.head, '--not', input.base]),
    reviewed = await readCommits(input, ['--right-only', '--cherry-pick', `${input.base}...${input.reviewed}`, ...below]);
  return await pickPairedHead(input, reviewed, branch);
}

async function pickPairedHead(input: RebasedHeadInput, reviewed: ListedCommit[], branch: ListedCommit[]): Promise<RebasedHead> {
  const patchIDs = await readPatchIDs(input.run, input.dir, collectPairedShas(reviewed, branch));
  return pickRebasedHead({ reviewedHead: input.reviewed, reviewed, branch, patchIDs });
}

// The non-merge commits to give a patch id: the reviewed ones and the branch commits they pair with.
function collectPairedShas(reviewed: ListedCommit[], branch: ListedCommit[]): string[] {
  return [...reviewed, ...branch.slice(0, reviewed.length)].filter((commit) => commit.parents.length < 2).map((commit) => commit.sha);
}

// The commits a rev-list range lists, oldest first, each with its parents.
async function readCommits(input: RebasedHeadInput, range: string[]): Promise<ListedCommit[]> {
  const listed = await input.run(['git', 'rev-list', '--reverse', '--topo-order', '--parents', ...range], { cwd: input.dir });
  if (listed.code !== 0) {
    throw new GitReadError(`git cannot list ${range.join(' ')}: ${(listed.stderr || listed.stdout).trim().slice(0, 300)}`);
  }
  return listed.stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [sha = '', ...parents] = line.trim().split(/\s+/u);
      return { sha, parents };
    });
}

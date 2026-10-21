import type { Runner } from '../runner/types.ts';
import { flagByClone } from './flag-by-clone.ts';

const ISSUE_FLAG = '--issue-file';

// Whether the pinned noslop takes --issue-file, from its review help; asked once per clone.
export async function checkIssueFlag(run: Runner, clone: string, cwd: string): Promise<boolean> {
  if (!flagByClone.has(clone)) {
    const takes = await readIssueFlag(run, clone, cwd);
    flagByClone.set(clone, takes);
  }
  return flagByClone.get(clone) === true;
}

async function readIssueFlag(run: Runner, clone: string, cwd: string): Promise<boolean> {
  const help = await run(['bun', `--config=${clone}/bunfig.toml`, `${clone}/apps/cli/src/cli.ts`, 'review', '--help'], { cwd });
  return help.code === 0 && help.stdout.includes(ISSUE_FLAG);
}

import type { Runner } from '../runner/types.ts';
import { CHECK_SCRIPT, firstLine, summarizeFindings } from './read-imp-work.ts';
import type { ImpWork } from './types.ts';

const LOCAL_CALL_MS = 120_000;

// A local cwd may be a checkout shared with other worktrees, and the check covers all of them, so
// an unrelated dirty worktree keeps the session: the safe side.
export async function readLocalWork(run: Runner, cwd: string | null | undefined): Promise<ImpWork> {
  if (!cwd) {
    return { state: 'unknown', detail: 'atc gave no working directory for the session' };
  }
  const checked = await run(['sh', '-c', CHECK_SCRIPT, 'sh', cwd], { timeoutMs: LOCAL_CALL_MS });
  if (checked.code !== 0) {
    return { state: 'unknown', detail: `the check in ${cwd} exited ${checked.code}: ${firstLine(checked.stderr)}` };
  }
  return summarizeFindings(checked.stdout, cwd);
}

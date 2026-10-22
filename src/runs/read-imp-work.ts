import { z } from 'zod';
import type { Runner } from '../runner/types.ts';
import type { ImpWork } from './types.ts';

const impListSchema = z.array(z.looseObject({ name: z.string() }));

// Lists each worktree's uncommitted changes, then the commits that no remote branch holds. Any
// line out means unpushed work. Each git call's failure exits the script nonzero: no git call runs
// inside a pipe, whose status would be the last command's.
const CHECK_SCRIPT = [
  'set -eu',
  'cd "$1"',
  'trees=$(git worktree list --porcelain) || exit 1',
  'printf "%s\\n" "$trees" | while IFS= read -r line; do',
  '  case "$line" in "worktree "*) ;; *) continue ;; esac',
  '  tree=${line#worktree }',
  '  changes=$(git -C "$tree" status --porcelain) || exit 1',
  '  printf "%s\\n" "$changes" | while IFS= read -r change; do',
  '    if [ -n "$change" ]; then printf "%s: %s\\n" "$tree" "$change"; fi',
  '  done',
  'done',
  'git log --oneline HEAD --branches --not --remotes',
].join('\n');

const IMP_CALL_MS = 120_000;

// atc names a session's imp with the target's prefix and the first 20 letters and digits of the
// session id, so the imp is the one whose name ends with them.
export async function readImpWork(run: Runner, sessionID: string, cwd: string | null | undefined): Promise<ImpWork> {
  if (!cwd) {
    return { state: 'unknown', detail: 'atc gave no working directory for the session' };
  }
  const listed = await run(['imp', 'ls', '--json'], { timeoutMs: IMP_CALL_MS });
  if (listed.code !== 0) {
    return { state: 'unknown', detail: `imp ls failed: ${firstLine(listed.stderr)}` };
  }
  const parsed = impListSchema.safeParse(parseJSON(listed.stdout));
  if (!parsed.success) {
    return { state: 'unknown', detail: 'imp ls gave no imp list' };
  }
  const suffix = sessionID.toLowerCase().replaceAll(/[^a-z0-9]/gu, '').slice(0, 20);
  const imp = parsed.data.find((entry) => entry.name.endsWith(`-${suffix}`));
  if (imp === undefined) {
    return { state: 'unknown', detail: `no imp ends with ${suffix}` };
  }
  const checked = await run(['imp', 'exec', imp.name, '--', 'sh', '-c', CHECK_SCRIPT, 'sh', cwd], { timeoutMs: IMP_CALL_MS });
  if (checked.code !== 0) {
    return { state: 'unknown', detail: `the check in ${imp.name} exited ${checked.code}: ${firstLine(checked.stderr)}` };
  }
  const lines = checked.stdout.split('\n').filter((line) => line.trim() !== '');
  if (lines.length > 0) {
    return { state: 'unpushed', detail: `${imp.name}: ${lines.slice(0, 3).join('; ')}${lines.length > 3 ? ` and ${lines.length - 3} more` : ''}` };
  }
  return { state: 'pushed' };
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0] ?? '';
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

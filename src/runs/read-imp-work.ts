import { z } from 'zod';
import type { RunResult, Runner } from '../runner/types.ts';
import type { ImpWork } from './types.ts';

const impListSchema = z.array(z.looseObject({ name: z.string() }));

// A removed local working directory holds no work, so the check says so with its own exit code. A cd
// that fails for another reason, such as permissions, stays an unknown.
const GONE_CODE = 3;
const GONE_MARKER = 'workspace gone';

// A failed git call exits nonzero: none runs inside a pipe, whose status would be the last command's.
export const CHECK_SCRIPT = [
  'set -eu',
  String.raw`if [ ! -e "$1" ]; then echo "${GONE_MARKER}" >&2; exit ${GONE_CODE}; fi`,
  'cd "$1"',
  'trees=$(git worktree list --porcelain) || exit 1',
  String.raw`printf "%s\n" "$trees" | while IFS=' ' read -r key tree; do`,
  '  if [ "$key" != worktree ]; then continue; fi',
  '  changes=$(git -C "$tree" status --porcelain) || exit 1',
  String.raw`  printf "%s\n" "$changes" | while IFS= read -r change; do`,
  '    case "$change" in',
  `      "?? .scratch/"|"?? .worktrees/"|"") ;;`,
  String.raw`      *) printf "%s: %s\n" "$tree" "$change" ;;`,
  '    esac',
  '  done',
  'done',
  'stashes=$(git stash list) || exit 1',
  String.raw`if [ -n "$stashes" ]; then printf "%s: %d stash entries\n" "$PWD" "$(printf "%s\n" "$stashes" | wc -l)"; fi`,
  String.raw`heads=$(printf "%s\n" "$trees" | sed -n "s/^HEAD //p")`,
  'git log --oneline $heads --branches --not --remotes',
].join('\n');

const IMP_CALL_MS = 120_000;

// impd answers with this code when it has no RAM to wake the imp; the check fits a later try.
const RAM_LIMIT_CODE = 'RAM_BUDGET_EXCEEDED';

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
  // A pushed imp is destroyed, so a missing working directory, such as an unmounted volume, stays an
  // unknown here.
  const checked = await run(['imp', 'exec', imp.name, '--', 'sh', '-c', CHECK_SCRIPT, 'sh', cwd], { timeoutMs: IMP_CALL_MS });
  if (checked.code !== 0) {
    const detail = `the check in ${imp.name} exited ${checked.code}: ${firstLine(checked.stderr)}`;
    return checked.stderr.includes(RAM_LIMIT_CODE) ? { state: 'unknown', detail, retry: true } : { state: 'unknown', detail };
  }
  return summarizeFindings(checked.stdout, imp.name);
}

export function isWorkspaceGone(checked: RunResult): boolean {
  return checked.code === GONE_CODE && checked.stderr.includes(GONE_MARKER);
}

// The script prints one line per thing it found, so no output means all work is pushed.
export function summarizeFindings(stdout: string, label: string): ImpWork {
  const lines = stdout.split('\n').filter((line) => line.trim() !== '');
  if (lines.length > 0) {
    return { state: 'unpushed', detail: `${label}: ${lines.slice(0, 3).join('; ')}${lines.length > 3 ? ` and ${lines.length - 3} more` : ''}` };
  }
  return { state: 'pushed' };
}

export function firstLine(text: string): string {
  return text.trim().split('\n')[0] ?? '';
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

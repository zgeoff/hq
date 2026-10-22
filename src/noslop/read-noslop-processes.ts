import { HqError } from '../errors.ts';
import { repoCache } from '../review/repo-cache.ts';
import type { Runner } from '../runner/types.ts';

export interface NoslopProcess {
  pid: number;
  command: string;
}

const COMMAND_CHARS = 100,
  LINE_SHAPE = /^(?<pid>\d+)\s+(?<command>.*)$/u,
  PGREP_NONE = 1;

// The processes running a noslop CLI from one of hq's clones, other than hq itself. Exit 1 of pgrep
// is none; any other failure refuses, because hq cannot then tell whether noslop runs.
export async function readNoslopProcesses(run: Runner): Promise<NoslopProcess[]> {
  const pattern = `${buildEscapedPattern(repoCache())}/zgeoff/noslop[^ ]*/apps/cli/src/cli\\.ts`,
    result = await run(['pgrep', '-af', '--', pattern]);
  if (result.code === PGREP_NONE) {
    return [];
  }
  if (result.code !== 0) {
    const out = (result.stderr || result.stdout).trim().slice(0, COMMAND_CHARS);
    throw new HqError('noslop_busy', `hq cannot tell whether noslop runs: pgrep failed (${result.code}): ${out}. Wait, or pass --force <reason>.`);
  }
  return result.stdout
    .split('\n')
    .map((line) => LINE_SHAPE.exec(line.trim()))
    .filter((match) => match !== null)
    .map((match) => ({ pid: Number(match.groups?.['pid']), command: (match.groups?.['command'] ?? '').slice(0, COMMAND_CHARS) }))
    .filter((found) => found.pid !== process.pid);
}

function buildEscapedPattern(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

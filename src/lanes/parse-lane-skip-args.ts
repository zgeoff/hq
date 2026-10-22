import { P, match } from 'ts-pattern';
import { HqError } from '../errors.ts';
import { ISSUE } from '../followups/issue.ts';

export type LaneSkipArgs = { kind: 'list' } | { kind: 'drop'; issue: string } | { kind: 'set'; issue: string; until: string; reason: string };

export const LANE_SKIP_USAGE = 'usage: hq lanes skip <issue> --until <ISO time|GEO-n> --reason TEXT | hq lanes skip list | hq lanes skip drop <issue>';

// hq lanes skip's words after the verb, with its --until and --reason flags, as one command. Anything
// else is bad_args with the usage.
export function parseLaneSkipArgs(rest: readonly string[], until: string | undefined, reason: string | undefined): LaneSkipArgs {
  return match(rest)
    .returnType<LaneSkipArgs>()
    .with(['list'], () => ({ kind: 'list' }))
    .with(['drop', P.string], ([, issue]) => ({ kind: 'drop', issue }))
    .with([P.string], ([issue]) => {
      if (!ISSUE.test(issue)) {
        throw new HqError('bad_args', `hq lanes skip takes an issue like GEO-123, list or drop, not "${issue.slice(0, 60)}"; ${LANE_SKIP_USAGE}`);
      }
      return { kind: 'set', issue, until: needFlag(until, 'until'), reason: needFlag(reason, 'reason') };
    })
    .with([], () => {
      throw new HqError('bad_args', LANE_SKIP_USAGE);
    })
    .otherwise((words) => {
      throw new HqError('bad_args', `unknown command: hq lanes skip ${words.join(' ')}; ${LANE_SKIP_USAGE}`);
    });
}

function needFlag(value: string | undefined, name: string): string {
  if (value === undefined) {
    throw new HqError('bad_args', `--${name} is required; ${LANE_SKIP_USAGE}`);
  }
  return value;
}

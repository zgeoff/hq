import type { Database } from 'bun:sqlite';
import { P, match } from 'ts-pattern';
import { HqError } from '../errors.ts';
import { ISSUE } from '../followups/issue.ts';
import { isSkipActive } from './is-skip-active.ts';
import { readLaneSkips } from './read-lane-skips.ts';
import { removeLaneSkip } from './remove-lane-skip.ts';
import { writeLaneSkip } from './write-lane-skip.ts';

export interface LaneSkipCommandDeps {
  db: Database;
  actor: string;
  at: Date;
  rest: readonly string[];
  until: string | undefined;
  reason: string | undefined;
}

interface SkipOut {
  data: Record<string, unknown>;
  text: string;
}

const USAGE = 'usage: hq lanes skip <issue> --until <ISO time|GEO-n> --reason TEXT | hq lanes skip list | hq lanes skip drop <issue>';

// hq lanes skip <issue>|list|drop. A skip leaves one Ready issue out of the lanes' picks until its
// time passes, or until its until issue is Done or Canceled, and the Ready summary lists it as skipped.
export function runLaneSkipCommand(deps: LaneSkipCommandDeps): SkipOut {
  return match(deps.rest)
    .with(['list'], () => {
      const skips = readLaneSkips(deps.db).filter((skip) => isSkipActive(skip, deps.at));
      const lines = skips.map((skip) => `  ${skip.issue} until ${skip.until}: ${skip.reason} (${skip.by}, ${skip.at})`);
      return { data: { skips }, text: skips.length === 0 ? 'No lane skips.' : ['Lane skips:', ...lines].join('\n') };
    })
    .with(['drop', P.string], ([, issue]) => {
      const dropped = removeLaneSkip(deps.db, issue, deps.actor);
      return { data: { issue, dropped }, text: dropped ? `Skip dropped: the lanes may pick ${issue} from their next look.` : `${issue} has no skip.` };
    })
    .with([P.string], ([issue]) => {
      if (!ISSUE.test(issue)) {
        throw new HqError('bad_args', `hq lanes skip takes an issue like GEO-123, list or drop, not "${issue.slice(0, 60)}"; ${USAGE}`);
      }
      const skip = writeLaneSkip(deps.db, { issue, until: needFlag(deps.until, 'until'), reason: needFlag(deps.reason, 'reason'), actor: deps.actor, at: deps.at });
      return { data: { skip }, text: `Skipped ${skip.issue} until ${skip.until}: ${skip.reason}. The lanes leave it out from their next look; hq lanes skip drop ${skip.issue} ends it sooner.` };
    })
    .with([], () => {
      throw new HqError('bad_args', USAGE);
    })
    .otherwise((rest) => {
      throw new HqError('bad_args', `unknown command: hq lanes skip ${rest.join(' ')}; ${USAGE}`);
    });
}

function needFlag(value: string | undefined, name: string): string {
  if (value === undefined) {
    throw new HqError('bad_args', `--${name} is required; ${USAGE}`);
  }
  return value;
}

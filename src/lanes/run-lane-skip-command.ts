import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { isSkipActive } from './is-skip-active.ts';
import type { LaneSkipArgs } from './parse-lane-skip-args.ts';
import { readLaneSkips } from './read-lane-skips.ts';
import { readSkipUnread } from './read-skip-unread.ts';
import { removeLaneSkip } from './remove-lane-skip.ts';
import { writeLaneSkip } from './write-lane-skip.ts';

export interface LaneSkipCommandDeps {
  db: Database;
  actor: string;
  at: Date;
  args: LaneSkipArgs;
}

interface SkipOut {
  data: Record<string, unknown>;
  text: string;
}

// hq lanes skip <issue>|list|drop. A skip leaves one Ready issue out of the lanes' picks until its
// time passes, or until its until issue is Done or Canceled, and the Ready summary lists it as skipped.
export function runLaneSkipCommand(deps: LaneSkipCommandDeps): SkipOut {
  return match(deps.args)
    .with({ kind: 'list' }, () => {
      const skips = readLaneSkips(deps.db).filter((skip) => isSkipActive(skip, deps.at));
      const unread = readSkipUnread(deps.db);
      const lines = skips.map((skip) => `  ${skip.issue} until ${skip.until}: ${skip.reason} (${skip.by}, ${skip.at})${formatUnread(unread[skip.until])}`);
      return { data: { skips, unread }, text: skips.length === 0 ? 'No lane skips.' : ['Lane skips:', ...lines].join('\n') };
    })
    .with({ kind: 'drop' }, (args) => {
      const dropped = removeLaneSkip(deps.db, args.issue, deps.actor);
      return { data: { issue: args.issue, dropped }, text: dropped ? `Skip dropped: the lanes may pick ${args.issue} from their next look.` : `${args.issue} has no skip.` };
    })
    .with({ kind: 'set' }, (args) => {
      const skip = writeLaneSkip(deps.db, { issue: args.issue, until: args.until, reason: args.reason, actor: deps.actor, at: deps.at });
      return { data: { skip }, text: `Skipped ${skip.issue} until ${skip.until}: ${skip.reason}. The lanes leave it out from their next look; hq lanes skip drop ${skip.issue} ends it sooner.` };
    })
    .exhaustive();
}

function formatUnread(error: string | undefined): string {
  return error === undefined ? '' : `; hq cannot tell when it ends: ${error}`;
}

import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { logEvent } from '../log-event.ts';
import { readEvents } from '../read-events.ts';
import { decideHandedInHold } from './decide-handed-in-hold.ts';
import type { HandedInHold, IssueRead } from './decide-handed-in-hold.ts';
import { getRun } from './get-run.ts';
import { SCOPE_HOLD_ACTIONS } from './is-scope-held.ts';
import { pickHandedInHoldWrite } from './pick-handed-in-hold-write.ts';
import { toMessage } from './to-message.ts';

export interface HandedInHolds {
  readIssueDescription: (issue: string) => Promise<string>;
  log: (line: string) => void;
}

// Linear is read only for a run that waits on something.
export async function runHandedInHoldCheck(db: Database, holds: HandedInHolds, issue: string, actor: string): Promise<HandedInHold> {
  const waitsOn = getRun(db, issue)?.waits_on ?? null;
  const hasWait = waitsOn !== null && waitsOn.trim() !== '';
  const read = hasWait ? await readIssue(holds, issue) : null;
  const hold = decideHandedInHold(waitsOn, read);
  const picked = pickHandedInHoldWrite(issue, hold, readEvents(db, 'run', issue, SCOPE_HOLD_ACTIONS).at(-1));
  match(picked)
    .with({ write: 'held' }, (held) => {
      logEvent(db, 'run', issue, 'handed-in-held', actor, null, null, held.data);
      holds.log(held.line);
    })
    .with({ write: 'released' }, () => {
      logEvent(db, 'run', issue, 'handed-in-released', actor, null, null);
    })
    .with({ write: 'none' }, (none) => {
      if (none.line !== null) {
        holds.log(none.line);
      }
    })
    .exhaustive();
  return hold;
}

async function readIssue(holds: HandedInHolds, issue: string): Promise<IssueRead> {
  try {
    return { ok: true, description: await holds.readIssueDescription(issue) };
  } catch (error) {
    return { ok: false, reason: toMessage(error).slice(0, 200) };
  }
}

import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { logEvent } from '../log-event.ts';
import { readEvents } from '../read-events.ts';
import { decideHandedInHold } from './decide-handed-in-hold.ts';
import type { HandedInHold, IssueRead } from './decide-handed-in-hold.ts';
import { getRun } from './get-run.ts';
import { toMessage } from './to-message.ts';

export interface HandedInHolds {
  readIssueDescription: (issue: string) => Promise<string>;
  log: (line: string) => void;
}

const HeldData = z.object({ openBoxes: z.number() });

// Linear is read only for a run that waits on something, and a held run logs once per change in its
// open box count, not once per sweep.
export async function runHandedInHoldCheck(db: Database, holds: HandedInHolds, issue: string, actor: string): Promise<HandedInHold> {
  const waitsOn = getRun(db, issue)?.waits_on ?? null;
  const hasWait = waitsOn !== null && waitsOn.trim() !== '';
  const read = hasWait ? await readIssue(holds, issue) : null;
  const hold = decideHandedInHold(waitsOn, read);
  if (hold.hold && hold.why === 'read-failed') {
    holds.log(`handed-in held for ${issue}: could not read its Linear Scope (${hold.reason})`);
  }
  if (hold.hold && hold.why === 'open-boxes') {
    const last = readEvents(db, 'run', issue, ['handed-in-held']).at(-1);
    const lastBoxes = last === undefined ? null : (HeldData.safeParse(JSON.parse(last.data)).data?.openBoxes ?? null);
    if (lastBoxes !== hold.openBoxes) {
      logEvent(db, 'run', issue, 'handed-in-held', actor, null, null, { openBoxes: hold.openBoxes });
      holds.log(`handed-in held for ${issue}: it waits on more parts and its Linear Scope has ${hold.openBoxes} open box${hold.openBoxes === 1 ? '' : 'es'}`);
    }
  }
  return hold;
}

async function readIssue(holds: HandedInHolds, issue: string): Promise<IssueRead> {
  try {
    return { ok: true, description: await holds.readIssueDescription(issue) };
  } catch (error) {
    return { ok: false, reason: toMessage(error).slice(0, 200) };
  }
}

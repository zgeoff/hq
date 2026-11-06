import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { StoredEvent } from '../read-events.ts';
import type { HandedInHold } from './decide-handed-in-hold.ts';

export type HandedInHoldWrite =
  | { write: 'held'; data: { openBoxes: string; boxesHash: string }; line: string }
  | { write: 'released' }
  | { write: 'none'; line: string | null };

const BOXES_CAP = 300;

const HeldData = z.object({ boxesHash: z.string() });

// A held run logs once per change in the set of its open boxes, not once per sweep. A failed read
// writes no event, so it holds only this sweep's hand-in and never the run's other paths to merged.
export function pickHandedInHoldWrite(issue: string, hold: HandedInHold, newest: StoredEvent | undefined): HandedInHoldWrite {
  if (!hold.hold) {
    return newest?.action === 'handed-in-held' ? { write: 'released' } : { write: 'none', line: null };
  }
  if (hold.why === 'read-failed') {
    return { write: 'none', line: `handed-in held for ${issue}: could not read its Linear Scope (${hold.reason})` };
  }
  const boxesHash = createHash('sha256').update(JSON.stringify(hold.boxes.toSorted())).digest('hex');
  const lastHash = newest?.action === 'handed-in-held' ? (HeldData.safeParse(JSON.parse(newest.data)).data?.boxesHash ?? null) : null;
  if (lastHash === boxesHash) {
    return { write: 'none', line: null };
  }
  const openBoxes = hold.boxes.join('; ').slice(0, BOXES_CAP);
  return { write: 'held', data: { openBoxes, boxesHash }, line: `handed-in held for ${issue}: it waits on more parts and its Linear Scope has open boxes: ${openBoxes}` };
}

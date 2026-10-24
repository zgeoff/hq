import type { Database } from 'bun:sqlite';
import { countWorking } from '../../lanes/cap/count-working.ts';
import type { Runner } from '../../runner/types.ts';
import { readSlotOpToken } from './read-slot-op-token.ts';
import { readSlotReading } from './read-slot-reading.ts';
import { SLOT_NUMBERS } from './slot-numbers.ts';
import type { SlotReading } from './types.ts';
import { writeSlotUsage } from './write-slot-usage.ts';

export type SlotReadRun = { kind: 'not-set-up'; reason: string } | { kind: 'read'; readings: SlotReading[]; problems: string[] };

// Reads the four slots one after another and stores what each said. A slot that fails is stored
// with its failure status, so one bad slot never hides the others.
export async function runSlotRead(db: Database, run: Runner, at: Date): Promise<SlotReadRun> {
  const opToken = await readSlotOpToken();
  if (opToken.kind === 'not-set-up') {
    return opToken;
  }
  const readings: SlotReading[] = [];
  const problems: string[] = [];
  for (const slot of SLOT_NUMBERS) {
    const result = await readSlotReading(run, opToken.token, slot);
    readings.push(result.reading);
    if (result.problem !== null) {
      problems.push(result.problem);
    }
  }
  writeSlotUsage(db, readings, countWorking(db, at).count, at);
  return { kind: 'read', readings, problems };
}

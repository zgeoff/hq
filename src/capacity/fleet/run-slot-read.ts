import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { countWorking } from '../../lanes/cap/count-working.ts';
import type { Runner } from '../../runner/types.ts';
import { readSlotOpToken } from './read-slot-op-token.ts';
import { readSlotReading } from './read-slot-reading.ts';
import { SLOT_NUMBERS } from './slot-numbers.ts';
import type { SlotReading } from './types.ts';
import { writeSlotUsage } from './write-slot-usage.ts';

export type SlotReadRun = { kind: 'not-set-up'; reason: string } | { kind: 'read'; readings: SlotReading[]; problems: string[] };

export async function runSlotRead(db: Database, run: Runner, at: Date, signal: AbortSignal): Promise<SlotReadRun> {
  const opToken = await readSlotOpToken();

  return match(opToken)
    .with({ kind: 'not-set-up' }, (notSetUp): Promise<SlotReadRun> => Promise.resolve(notSetUp))
    .with({ kind: 'ready' }, (ready) => readReadySlots(db, run, at, { opToken: ready.token, signal }))
    .exhaustive();
}

interface SlotAccess {
  opToken: string;
  signal: AbortSignal;
}

async function readReadySlots(db: Database, run: Runner, at: Date, access: SlotAccess): Promise<SlotReadRun> {
  const readings: SlotReading[] = [];
  const problems: string[] = [];
  for (const slot of SLOT_NUMBERS) {
    const result = await readSlotReading(run, access.opToken, slot, access.signal);
    readings.push(result.reading);
    if (result.problem !== null) {
      problems.push(result.problem);
    }
  }
  access.signal.throwIfAborted();
  writeSlotUsage(db, readings, countWorking(db, at).count, at);
  return { kind: 'read', readings, problems };
}

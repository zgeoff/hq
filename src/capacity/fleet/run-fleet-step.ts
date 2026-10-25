import type { Database } from 'bun:sqlite';
import { isSlotReadDue } from './is-slot-read-due.ts';
import { readFleetView } from './read-fleet-view.ts';
import { readNewestSlotReadAt } from './read-newest-slot-read-at.ts';
import { runSlotRead } from './run-slot-read.ts';
import type { SlotReadRun } from './run-slot-read.ts';
import type { FleetIO, FleetView } from './types.ts';
import { writeFleetNews } from './write-fleet-news.ts';

export interface FleetStep {
  read: SlotReadRun | null;
  view: FleetView;
  news: boolean;
}

export interface FleetStepOptions {
  force: boolean;
  signal: AbortSignal;
}

export async function runFleetStep(db: Database, io: FleetIO, at: Date, options: FleetStepOptions): Promise<FleetStep> {
  const signal = options.signal;
  const due = options.force || isSlotReadDue(readNewestSlotReadAt(db), at);
  const read = due ? await runSlotRead(db, io, at, signal) : null;
  const view = await readFleetView(db, io, at);
  signal.throwIfAborted();
  const news = view.notSetUp === null && writeFleetNews(db, view);
  return { read, view, news };
}

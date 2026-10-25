import type { SlotReadRun } from '../capacity/fleet/run-slot-read.ts';
import type { Runner } from '../runner/types.ts';

interface WatchSteps {
  runs(): Promise<void>; // atc notes and the sweep
  weekly(): Promise<boolean>; // the Monday stats line
  health(): Promise<{ opened: unknown[]; cleared: unknown[] }>;
  refusals?(): Promise<number>; // scan the transcripts; the refusals added
  slots?: (signal: AbortSignal) => Promise<{ read: SlotReadRun | null; news: boolean }>;
  capacity?(): Promise<{ opened: unknown[]; cleared: unknown[] }>; // sample capacity, alert on thresholds
}

export interface WatchDeps {
  me: string;
  run: Runner; // bounded: every call has a deadline
  steps: WatchSteps;
  log(line: string): void;
  stepMs?: number;
}

// ---------- the outside check ----------

export interface WatcherState {
  lastTick: string | null;
  since: string | null; // the last tick, else when the loop started
  stale: boolean;
  minutes: number | null;
}

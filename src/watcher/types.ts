import type { SlotReadRun } from '../capacity/fleet/run-slot-read.ts';
import type { GrantMarkSync } from '../grants/sync-grant-marks.ts';
import type { WrapUpDeps } from '../runs/run-wrap-up.ts';
import type { Runner } from '../runner/types.ts';

interface WatchSteps {
  runs: () => Promise<void>;
  weekly: () => Promise<boolean>;
  health: () => Promise<{ opened: unknown[]; cleared: unknown[] }>;
  refusals?: () => Promise<number>;
  slots?: (signal: AbortSignal) => Promise<{ read: SlotReadRun | null; news: boolean }>;
  capacity?: () => Promise<{ opened: unknown[]; cleared: unknown[] }>;

  wrapUpDeps?: () => { deps: WrapUpDeps; close: () => void };

  grantMarks?: () => GrantMarkSync | null;
}

export interface WatchDeps {
  me: string;
  run: Runner;
  steps: WatchSteps;
  log(line: string): void;
  stepMs?: number;
}

export interface WatcherState {
  lastTick: string | null;
  since: string | null;
  stale: boolean;
  minutes: number | null;
}

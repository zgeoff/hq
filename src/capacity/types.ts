import type { CapacitySampleRow } from '../kdb.ts';
import type { Runner } from '../runner/types.ts';
import type { CAPACITY_DEFAULTS } from './capacity-defaults.ts';
import type { LanePlan } from '../lanes/build-lane-plan.ts';

export type CapacitySettings = typeof CAPACITY_DEFAULTS;

export interface CapacityProbe {
  run: Runner;
  readText: (url: string, timeoutMs: number) => Promise<string>;
  readFile(path: string): Promise<string>;
  readMs?: number; // the deadline of each read (default 15 s)

  // The imp lanes' plan from pacing.json, checked against impd's lines with each reading; left
  // out, no lanes were read.
  plan?: LanePlan | null;
}

// One reading to check, with the imp lanes' plan; null when no pacing.json lanes were read.
export interface CapacityInput {
  reading: Reading;
  plan: LanePlan | null;
}

export type Errors = Record<string, string>;

// The 1Password account's requests today and its daily limit; refused when any limit is spent.
export interface OnePasswordUse {
  used: number | null;
  limit: number | null;
  refused: boolean;
}
export type Reading = Omit<CapacitySampleRow, 'errors'> & { errors: Errors };

export interface Impd {
  budgetMib: number | null;
  usedMib: number | null;
  committedMib: number | null;
  nonnixAwakeMib: number | null;
  nonnixAwakeVcpus: number | null;
  nixAwakeMib: number | null;
}

export interface Rule {
  key: string;
  label: string; // for the back-under message
  limit: (s: CapacitySettings) => string;
  urgent?: boolean;

  // true: breached; false: fine; null: no reading. `plan` is the imp lanes' plan; null when no
  // pacing.json lanes were read.
  breached: (r: Reading, s: CapacitySettings, plan: LanePlan | null) => boolean | null;
  line: (r: Reading, s: CapacitySettings, names: Record<string, string>, plan: LanePlan | null) => string;
}

export interface CapacityTick {
  opened: string[]; // keys that opened this tick
  cleared: string[]; // keys that cleared this tick
  told: { opened: string[]; cleared: string[] }; // what the messages sent this tick carried
}

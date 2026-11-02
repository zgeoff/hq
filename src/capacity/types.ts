import type { CapacitySampleRow } from '../kdb.ts';
import type { Runner } from '../runner/types.ts';
import type { CAPACITY_DEFAULTS } from './capacity-defaults.ts';
import type { LanePlan } from '../lanes/build-lane-plan.ts';

export type CapacitySettings = typeof CAPACITY_DEFAULTS;

export interface CapacityProbe {
  run: Runner;
  readText: (url: string, timeoutMs: number) => Promise<string>;
  readFile(path: string): Promise<string>;
  readMs?: number;

  plan?: LanePlan | null;

  claudeLaunchPct?: number | null;
}

export interface CapacityInput {
  reading: Reading;
  plan: LanePlan | null;
  claudeLaunchPct?: number | null;
}

interface RuleContext {
  plan: LanePlan | null;
  claudeLaunchPct: number | null;
}

export type Errors = Record<string, string>;

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
  label: string;
  limit: (s: CapacitySettings) => string;
  urgent?: boolean;

  breached: (reading: Reading, settings: CapacitySettings, ctx: RuleContext) => boolean | null;
  line: (reading: Reading, settings: CapacitySettings, names: Record<string, string>, ctx: RuleContext) => string;
}

export interface CapacityTick {
  opened: string[];
  cleared: string[];
  told: { opened: string[]; cleared: string[] };
}

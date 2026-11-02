import type { GoalKey } from './goal-keys.ts';
import type { Op } from './ops.ts';

export interface Target {
  op: Op;
  value: number;
  until?: string;
  detectMax?: number;
}
export type Targets = Record<GoalKey, Target | null>;

export interface Measure {
  value: number | null;
  exact?: number;
  denominator: number;
  unit: string;
  shown: string;
  detail: string;
  longest?: number;
  longestExact?: number;
  outages?: number;
  blind?: number;
  ci?: number;
  unclassified?: number;

  unknown?: number;
  extra?: string;
  missing?: number;
}
export type Measures = Record<GoalKey, Measure>;
export type Verdict = 'green' | 'red' | 'none';

export type DeployOutcome = 'applied_ok' | 'applied_failed' | 'held' | 'no_apply' | 'cancelled' | 'unknown';

export interface GoalRow {
  label: string;
  from: string;
  to: string;
  partial: boolean;

  deploys: { runs: number; ok: number; failed: number; cancelled: number; running: number; applied_ok: number; applied_failed: number; applied_cancelled: number; held: number; no_apply: number; unknown: number; unclassified: number } | null;
  log: { deploy: number; hold: number } | null;
  ci: { runs: number; failed: number; cancelled: number; reruns: number; minutes: number; wasteMinutes: number; rawMinutes: number; rawWasteMinutes: number; missing: number };
  merged: number;
  closedUnmerged: number;
}

export interface LogFiles {
  listNames: (directory: string) => string[];
  probeExists: (path: string) => boolean;
  readText: (path: string) => string;
}

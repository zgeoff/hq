import type { GoalKey } from './goal-keys.ts';
import type { Op } from './ops.ts';

export interface Target {
  op: Op;
  value: number;
  until?: string; // a deadline date, YYYY-MM-DD
  detectMax?: number; // downtime only: each outage caught within this many minutes
}
export type Targets = Record<GoalKey, Target | null>;

export interface Measure {
  value: number | null; // percent rounded to whole numbers, for display; minutes for downtime; null with no data
  exact?: number; // the unrounded percent: targets are compared against this, never the rounded value
  n: number; // the denominator
  unit: string; // what n counts
  shown: string; // value as text: "20%", "3 min", "no data"
  detail: string;
  longest?: number; // downtime only: the slowest detection of an outage, minutes (rounded, for display)
  longestExact?: number; // downtime only: the same unrounded: the detection limit is judged on it
  outages?: number; // downtime only
  blind?: number; // downtime only: minutes the probe could not see
  ci?: number; // cost only: CI minutes in the window
  unclassified?: number; // deploys only: completed runs not yet read from GitHub; the value is partial, never judged
  extra?: string; // deploys only: what the rate leaves out (holds, no-apply runs, unclassified), for the reports
  missing?: number; // past days in the window whose data hq has not fetched: the value is incomplete, never judged
}
export type Measures = Record<GoalKey, Measure>;
export type Verdict = 'green' | 'red' | 'none';

export type DeployOutcome = 'applied_ok' | 'applied_failed' | 'held' | 'no_apply' | 'cancelled' | 'unknown';

export interface GoalRow {
  label: string;
  from: string;
  to: string;
  partial: boolean;
  deploys: { runs: number; ok: number; failed: number; cancelled: number; running: number; applied_ok: number; applied_failed: number; applied_cancelled: number; held: number; no_apply: number; unclassified: number } | null; // null: before the workflow existed; the applied_* to unclassified fields come from deploy_runs
  log: { deploy: number; hold: number } | null; // null: before the log starts
  ci: { runs: number; failed: number; cancelled: number; reruns: number; minutes: number; wasteMinutes: number; rawMinutes: number; rawWasteMinutes: number; missing: number }; // raw: unrounded, for target checks
  merged: number;
  closedUnmerged: number;
}

import type { RunState } from '../transitions/run-states.ts';

export interface Run {
  issue: string;
  title: string;
  place: 'local' | 'imp' | 'none';
  state: RunState;
  next: string;
  gate: string | null;
  geoff_chat: number;
  waits_on: string | null;
  waits_on_geoff: number;
  ready_since: string | null;
  size: 'S' | 'M' | 'L' | 'XL' | null;
  size_lines: number | null;
  lane: string | null;
  live_check: 'owed' | 'none' | null; // after the release ships: NULL and 'owed' mean a live check is owed
  close_note: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface RunSession {
  session_id: string;
  issue: string;
  active: number;
  helper: number;
  added_at: string;
  ended_at: string | null;
  ended_by: 'sweep' | null;
}

export interface RunPr {
  ref: string;
  issue: string;
  url: string | null;
  state: 'open' | 'merged' | 'closed';
  final_sha: string | null;
  final_at: string | null;
  final_source: string | null;
  review_started_at: string | null;
  reviewed_sha: string | null;
  review_round: number;
  reviewed_at: string | null;
  merged_at: string | null;
  merge_sha: string | null;
  shipped_tag: string | null;
  shipped_at: string | null;
  added_at: string;
  updated_at: string;
}

export interface RunNote {
  id: number;
  issue: string;
  session_id: string | null;
  label: string | null;
  text: string;
  source: 'atc' | 'cli';
  at: string;
}

export interface RunView extends Run {
  sessions: RunSession[];
  prs: RunPr[];
  lastNote: RunNote | null;
}

export interface AddRunInput {
  issue: string;
  title: string;
  place: 'local' | 'imp' | 'none';
  session: string | null;
  next: string;
  gate: string | null;
  geoffChat: boolean;
  readySince?: string | null; // when the issue became Ready in Linear, for cycle time
  size?: { size: 'S' | 'M' | 'L' | 'XL'; lines: number } | null; // triage's guess, from the ticket
  lane?: string | null; // a pacing.json lane, checked by the caller
  actor: string;
}

export type LiveCheck = 'owed' | 'none';

export interface FeedEvent {
  cursor: string;
  at: number;
  session: string;
  name: string | null;
  kind: string;
  detail: string | null;
  label?: string | undefined;
}

export interface IngestResult {
  read: number;
  notes: number;
  routed: number;
  finals: string[];
  unmatched: number;
  reset: boolean;
  bootstrapped: boolean;
}

export interface Alert {
  key: string;
  fingerprint: string;
  issue: string;
  line: string;
}

// One final mark: what set it (the cli, a marker or a phrase) and the run_notes row, if any.
export interface FinalMark {
  ref: string;
  sha: string;
  source: string;
  actor: string;
  note: number | null;
  resolution?: AcceptedFinal | null;
}

export type FinalResolution =
  | { kind: 'full'; sha: string }
  | { kind: 'refused'; reason: 'no-match'; head: string | null }
  | { kind: 'refused'; reason: 'ambiguous'; shas: string[] }
  | { kind: 'unresolved'; reason: string };

export type AcceptedFinal = Extract<FinalResolution, { kind: 'full' | 'unresolved' }>;
export type RefusedFinal = Extract<FinalResolution, { kind: 'refused' }>;

export interface FinalClaim {
  ref: string;
  sha: string;
}

export type FinalResolutions = ReadonlyMap<string, FinalResolution>;

export type CommitsRead = { kind: 'listed'; shas: string[] } | { kind: 'fault'; reason: string };
export type CommitRead = { kind: 'found'; sha: string } | { kind: 'missing' } | { kind: 'fault'; reason: string };

// What a check of an imp's workspace found: every commit on a remote branch and nothing
// uncommitted, work that is not pushed, or no answer.
export type ImpWork = { state: 'pushed' } | { state: 'unpushed'; detail: string } | { state: 'unknown'; detail: string };

// A session the wrap-up left in atc, and why.
export interface KeptSession {
  id: string;
  reason: string;
}

// What `hq run done` did with the run's sessions: forgotten, forgotten with their imp destroyed,
// kept on purpose, or failed.
export interface WrapUp {
  forgotten: string[];
  destroyed: string[];
  kept: KeptSession[];
  failed: KeptSession[];
}

// What the wrap-up does with one session tree: keep every session, each with why, or forget them
// all, destroying the root's imp when the run is on one.
export type WrapUpPlan = { kind: 'keep'; kept: KeptSession[] } | { kind: 'forget'; destroyImp: boolean };

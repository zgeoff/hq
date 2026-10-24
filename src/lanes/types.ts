import type { IssueType } from '../linear/issue-types.ts';
import type { LaneConfig } from '../areas/types.ts';

export interface Capacity {
  imp?: { freeMib?: number; room?: boolean; error?: string };
  providers?: Record<string, { room?: boolean; unattended?: boolean; target?: string }>;

  // capacity.sh's design slots: room while fewer Design sessions wait on the owner than it allows.
  design?: { room?: boolean };
}

// The slot caps by place the lanes' pool fills (pacing.json `slots`, or its lanes summed).
export interface PacingSlots {
  imp: number;
  local: number;
}

export interface Sample {
  cap: Capacity | null;
  impMib: number;
  error: string | null;
  lanes?: LaneConfig[] | null; // pacing.json's lanes; absent or null: one pool of imp slots

  // The pool's caps; absent or null with the lanes.
  slots?: PacingSlots | null;

  // The local sessions an unattended provider may run on this host (pacing.json's localFallback);
  // absent or null when one targets local, so only the local cap counts.
  localRoom?: number | null;
}

// A Ready issue the lanes leave out until a time passes, another issue is Done or Canceled, or a PR merges or closes.
export interface LaneSkip {
  issue: string;

  // An ISO time, the identifier of the issue it waits on, or `pr:repo#n` for a zgeoff PR it waits on.
  until: string;
  reason: string;
  by: string;
  at: string;
}

// Why free slots sit empty: Ready work waits (delivery), Backlog work waits for triage (triage), or
// none exists (supply). Unknown while the Ready or Backlog read is missing or stale.
export type SlotCauseName = 'delivery' | 'triage' | 'supply';

// The input that made a cause unknown: no Ready read yet, a stale one, or a Backlog count that failed,
// was made for another focus, or is stale.
export type SlotCauseUnknownReason = 'ready_never_read' | 'ready_stale' | 'backlog_unknown' | 'backlog_focus_changed' | 'backlog_stale';

// null: no free slot, or Ready work has waited under the grace time.
export interface SlotCause {
  cause: SlotCauseName | 'unknown' | null;
  slots: number;
  since: string | null;
  readyAgeMinutes: number | null;

  // Why the cause is unknown; null for any other cause.
  reason: SlotCauseUnknownReason | null;

  // How long eligible Ready work has waited while the cause is still null; null otherwise.
  waitingMinutes: number | null;
}

export interface TickResult {
  at: string;
  freeMib: number | null;
  slots: number;
  eligible: number | null;
  freeSince: string | null;
  freeMinutes: number;
  nudged: boolean;
  why: string;
  error: string | null;
  slotCause: SlotCause;
}

// A hold pauses the nudges while z-delivery keeps slots free on purpose (a host switch,
// a restart). It always ends by itself, so a forgotten hold can't keep the lanes empty.
export interface LanesHold {
  until: string;
  reason: string;
  by: string;
}

export interface NudgeRow {
  id: number;
  at: string;
  slots: number;
  free_minutes: number;
  eligible: number | null;
  slots_after: number | null;
  checked_at: string | null;
}

// lanes.json: how Ready issues in Linear map to pacing.json's lanes. A lane takes an issue that
// matches any of its lists; the lanes are tried in file order, then the fallback.
export interface LaneRule {
  issues: string[];
  projects: string[];
  labels: string[];
  childrenOf: string[];
  fallback: boolean;
}

interface ExcludeRule {
  projects: string[];
  labels: string[];
  reason: string;
}

export interface LaneRules {
  team: string;
  readyState: string;
  exclude: ExcludeRule[];
  lanes: Record<string, LaneRule>;
}

// A Ready issue as Linear reports it. labels holds every label name, the Type label included;
// priority is Linear's: 1 urgent to 4 low, 0 none.
export interface ReadyIssue {
  identifier: string;
  project: string | null;
  projectLabels: string[];
  labels: string[];
  type: IssueType;
  priority: number;
  createdAt: string;
  parent: string | null;
}

// A Backlog issue that triage may promote to Ready.
export interface PromotableIssue {
  identifier: string;
  title: string;
  facts: ReadyIssue;
}

// A Backlog issue as the promotion check sees it: the state type of each issue that blocks it, and
// whether Linear holds more relations than the one page hq read.
export interface BacklogIssue {
  description: string | null;
  labels: string[];
  blockerStates: string[];
  moreRelations: boolean;
}

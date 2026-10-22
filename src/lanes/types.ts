import type { IssueType } from '../linear/issue-types.ts';
import type { LaneConfig } from '../areas/types.ts';

export interface Capacity {
  imp?: { freeMib?: number; room?: boolean; error?: string };
  providers?: Record<string, { room?: boolean; unattended?: boolean; target?: string }>;
}

export interface Sample {
  cap: Capacity | null;
  impMib: number;
  error: string | null;
  lanes?: LaneConfig[] | null; // pacing.json's lanes; absent or null: one pool of imp slots
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
}

// A Backlog issue as the promotion check sees it: the state type of each issue that blocks it, and
// whether Linear holds more relations than the one page hq read.
export interface BacklogIssue {
  description: string | null;
  labels: string[];
  blockerStates: string[];
  moreRelations: boolean;
}

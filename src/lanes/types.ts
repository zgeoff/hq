import type { IssueType } from '../linear/issue-types.ts';
import type { LaneConfig } from '../areas/types.ts';

export interface Capacity {
  imp?: { freeMib?: number; room?: boolean; error?: string };
  providers?: Record<string, { room?: boolean; unattended?: boolean; target?: string }>;
}

export interface DesignSlots {
  agent: number;
  withGeoff: number;
}

export interface PacingSlots {
  imp: number;
  local: number;
}

export type PlaceTypes = Partial<Record<keyof PacingSlots, string[]>>;

export interface Sample {
  cap: Capacity | null;
  impMib: number;
  error: string | null;
  lanes?: LaneConfig[] | null;
  slots?: PacingSlots | null;
  localRoom?: number | null;
  design?: DesignSlots;
  placeTypes?: PlaceTypes | null;
  designError?: string | null;
}

export interface LaneSkip {
  issue: string;
  until: string;
  reason: string;
  by: string;
  at: string;
}

export type PoolCauseName = 'delivery' | 'triage' | 'supply';

export type SlotCauseName = PoolCauseName | 'design';

export type SlotCauseUnknownReason = 'ready_never_read' | 'ready_stale' | 'backlog_unknown' | 'backlog_focus_changed' | 'backlog_stale';

export interface SlotCause {
  cause: PoolCauseName | 'unknown' | null;
  slots: number;
  since: string | null;
  readyAgeMinutes: number | null;
  reason: SlotCauseUnknownReason | null;
  waitingMinutes: number | null;
  backlogError: string | null;
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

// One stretch of time a lanes hold was in force. Spans stay on record until a look counts past them.
export interface HeldSpan {
  from: string;
  until: string;
}

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

export interface PromotableIssue {
  identifier: string;
  title: string;
  facts: ReadyIssue;
}

export interface HeldIssue {
  identifier: string;
  title: string;
  blockers: { identifier: string; lastMergedAt: string }[];
}

export interface BacklogIssue {
  description: string | null;
  labels: string[];
  blockerStates: string[];
  moreRelations: boolean;
}

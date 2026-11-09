import type { IssueType } from '../linear/issue-types.ts';
import type { LaneConfig } from '../areas/types.ts';
import type { Impd } from '../capacity/types.ts';
import type { z } from 'zod';
import type { CapacitySchema } from './capacity-schema.ts';
import type { NudgeRowSchema } from './nudge-row-schema.ts';

export type Capacity = z.output<typeof CapacitySchema>;

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
  impd?: Impd | null;
  impdError?: string | null;
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

export type NudgeRow = z.output<typeof NudgeRowSchema>;

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

// openBlockers names the issues that block this one and are not Done; moreRelations says Linear holds
// more relations than hq read.
export interface TeamIssue {
  issue: ReadyIssue;
  openBlockers: string[];
  moreRelations: boolean;
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

export interface LanesSampleInput {
  at: string;
  freeMib: number | null;
  slots: number;
  eligible: number | null;
  error: string | null;
}

export interface LanesNudgeInput {
  at: string;
  slots: number;
  freeMinutes: number;
  eligible: number | null;
  eventSeq: number;
  detail: string | null;
}

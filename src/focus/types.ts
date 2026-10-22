import type { ReadyIssue } from '../lanes/types.ts';

export type FocusClass = 'maintenance' | 'roadmap';
export type FocusType = 'bug' | 'feature' | 'chore' | 'improvement' | 'investigation';
export type FocusPriority = 'urgent' | 'high+' | 'medium+';

// One filter of a term. An issue matches a term when it matches every filter in it.
export type FocusFilter =
  | { kind: 'class'; value: FocusClass }
  | { kind: 'type'; value: FocusType }
  | { kind: 'project'; value: string }
  | { kind: 'area'; value: string }
  | { kind: 'label'; value: string }
  | { kind: 'priority'; value: FocusPriority };

export interface FocusTerm {
  text: string;
  filters: FocusFilter[];
}

// n slots kept for one area while it has eligible work.
export interface FocusReserve {
  area: string;
  slots: number;
}

// The owner's steer: terms in priority order, and the reserves.
export interface Focus {
  terms: FocusTerm[];
  reserves: FocusReserve[];
  setAt: string;
  setBy: string;
}

// An eligible issue in the order the lanes take it; term is the index of the first focus term it
// matches, null for other eligible work.
export interface FocusEntry {
  issue: ReadyIssue;
  term: number | null;
}

// One free slot's issue. reserve names the area whose reserved slot it fills.
export interface FocusPick {
  issue: string;
  term: number | null;
  reserve: string | null;
}

export interface FocusPlan {
  picks: FocusPick[];

  // Reserved slots with nothing eligible in their area, given to other work.
  lent: { area: string; slots: number }[];
}

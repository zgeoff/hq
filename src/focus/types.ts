import type { PacingSlots, PlaceTypes, ReadyIssue } from '../lanes/types.ts';

type FocusClass = 'maintenance' | 'roadmap';
type FocusType = 'bug' | 'feature' | 'chore' | 'improvement' | 'investigation';
type FocusPriority = 'urgent' | 'high+' | 'medium+';

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

export interface FocusReserve {
  area: string;
  slots: number;
}

export interface Focus {
  terms: FocusTerm[];
  reserves: FocusReserve[];
  setAt: string;
  setBy: string;
}

export interface FocusEntry {
  issue: ReadyIssue;
  term: number | null;
}

export interface FocusPick {
  issue: string;
  term: number | null;
  reserve: string | null;
  place?: keyof PacingSlots;
}

export interface PlaceRoom {
  free: PacingSlots;
  types: PlaceTypes;
}

export interface FocusSlots {
  free: number;
  places: PlaceRoom | null;
}

export interface PlaceUnfit {
  slots: number;
  places: { place: keyof PacingSlots; types: string[] }[];
}

export interface FocusPlan {
  picks: FocusPick[];

  lent: { area: string; slots: number }[];

  unfit?: PlaceUnfit;
}

type Place = 'imp' | 'local';
export interface LaneConfig {
  name: string;
  place: Place;
  size: number;

  // false: the lane neither lends its free slots nor borrows another's (pacing.json `lends`).
  lends: boolean;
}

export interface Skipped {
  issue: string;
  reason: string;
}

export interface ReadyDetail {
  at: string;
  total: number | null;
  skipped: Skipped[];
}

export interface ReadySummary {
  total: number;
  eligible: number;
  skipped: Skipped[];
  unexplained: number;
  line: string;
}

export interface LaneView {
  name: string;
  place: Place;
  size: number;
  running: number;

  // Free after the imp memory cap and impd's non-Nix line; held names why an imp lane has fewer
  // free than its own count allows.
  free: number;
  held: string | null;
  ready: number | null; // null: unknown or stale
  readyAt: string | null;
  lendTo: string | null; // free, no Ready of its own: the area its slots can go to
}

export interface AwakeSession {
  id: string;
  alive: boolean;
  lifecycle?: { desired?: string; vm?: string; harness?: string };
  state?: string;
}

// The imp slots the lanes may fill now, and the limit that sets that number, for `hq lanes` to name
// when it holds a slot back.
export interface ImpRoom {
  slots: number;
  heldBy: string;
  line: { awakeMib: number; maxMib: number; awakeVcpus: number; maxVcpus: number } | null;
}

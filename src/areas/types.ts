type Place = 'imp' | 'local';
export interface LaneConfig {
  name: string;
  place: Place;
  size: number;
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

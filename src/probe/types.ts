interface FetchResult {
  ok: boolean;
  status: number | null;
  ms: number;
  error?: string;
}
export type Fetcher = (url: string) => Promise<FetchResult>;

export type ProbeState = 'up' | 'down' | 'blind';

export interface ProbeResult {
  state: ProbeState;
  opened?: number;
  closed?: number;
  // The ready check: absent when live failed and ready was not fetched.
  ready?: boolean;
  unreadyOpened?: number;
  unreadyClosed?: number;
  ms: number;
}

export interface OutageRow {
  id: number;
  started_at: string;
  detected_at: string;
  ended_at: string | null;
  alert_seq: number | null;
  recover_seq: number | null;
  kind: 'down' | 'unready';
}

export interface Downtime {
  from: string;
  to: string;
  samples: number;
  downMinutes: number;
  outages: number;
  longestDetectMinutes: number;
  blindMinutes: number;
  // The same figures unrounded, in milliseconds: targets are judged on these, the minutes are for display.
  downMs: number;
  longestDetectMs: number;
  blindMs: number;
}

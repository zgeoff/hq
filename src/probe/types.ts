import type { HqTables } from '../kdb.ts';

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
  ready?: boolean;
  unreadyOpened?: number;
  unreadyClosed?: number;
  ms: number;
}

export type OutageRow = HqTables['outages'];

export interface Downtime {
  from: string;
  to: string;
  samples: number;
  downMinutes: number;
  outages: number;
  longestDetectMinutes: number;
  blindMinutes: number;
  downMs: number;
  longestDetectMs: number;
  blindMs: number;
}

import type { Selectable } from 'kysely';
import type { HqTables } from '../db/hq-columns.ts';

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

export type OutageRow = Selectable<HqTables['outages']>;

export interface Downtime {
  from: string;
  to: string;
  samples: number;
  downMinutes: number;
  outages: number;
  longestDetectMinutes: number;
  blindMinutes: number;
  probeStart: string | null;
  downMs: number;
  longestDetectMs: number;
  blindMs: number;
}

export interface ProbeSampleInput {
  at: string;
  targetOk: boolean;
  controlOk: boolean | null;
  durationMs: number | null;
  detail: string | null;
  readyOk: boolean | null;
}

export interface OutageInput {
  startedAt: string;
  detectedAt: string;
  kind: OutageRow['kind'];
}

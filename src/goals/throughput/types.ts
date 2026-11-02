import type { Database } from 'bun:sqlite';
import type { Role } from '../../roles/role-names.ts';
import type { Verdict } from '../types.ts';

export interface ThroughputAlert {
  key: string;
  text: string;
  role?: Role;
}

export interface ThroughputLine {
  name: string;
  detail: string;
  target: string;
  verdict: Verdict;
  alerts: ThroughputAlert[];
}

export type ThroughputReader = (db: Database, from: Date, at: Date) => ThroughputLine;

export type IssueSource = 'owner' | 'design' | 'agent' | 'review' | 'live check' | 'bot';

export interface FiledIssue {
  issue: string;
  source: IssueSource;
  prRef: string | null;
}

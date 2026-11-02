import type { Database } from 'bun:sqlite';
import type { Role } from '../../roles/role-names.ts';
import type { Verdict } from '../types.ts';

// One message about one item, sent once: the key names the item. It goes to the session holding the
// role, triage when none is named.
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

// A check-in line over [from, at): the Sydney day so far when it prints, the window just read from
// Linear when it alerts.
export type ThroughputReader = (db: Database, from: Date, at: Date) => ThroughputLine;

export type IssueSource = 'owner' | 'design' | 'agent' | 'review' | 'live check' | 'bot';

export interface FiledIssue {
  issue: string;
  source: IssueSource;
  prRef: string | null;
}

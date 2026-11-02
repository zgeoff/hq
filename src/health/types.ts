import type { Runner } from '../runner/types.ts';

export interface Check {
  key: string;
  ok: boolean;
  line: string;

  owner?: CheckOwner;
}

export interface CheckOwner {
  session: string;
  ask: string;
}

export interface AtcMcpProcess {
  pid: number;
  sessionID: string | null;
  startedAtMs: number;

  // Ends with ' (deleted)' once the file was replaced.
  exe: string;
}

export type AtcMcpRead = { processes: AtcMcpProcess[]; binary: { path: string; mtimeMs: number } } | string;

export interface AtcMcpFiles {
  procRoot: string;
  readFile: (path: string) => string;
  readdir: (path: string) => string[];
  readlink: (path: string) => string;
  mtimeMs: (path: string) => number;
  whichAtc: () => string | null;
}

export interface Probe {
  run: Runner;
  readFile: (path: string) => Promise<string>;
  atcAnswers: () => Promise<string | null>;
  atcMcp?: () => Promise<AtcMcpRead>;

  stateSizes?: () => Check[];

  sessionName?: (sessionID: string) => string | null;
  home: string;
  backup?: () => { lastOk: string | null; lastError: string | null; everRan: boolean };
  morning?: (at: Date) => Check | null;
  goalsDaily?: (at: Date) => Check | null;
  goalsWeekly?: (at: Date) => Check | null;
  defsTree?: (at: Date) => Check | null;

  privateTree?: (at: Date) => Check | null;

  grantMarks?: () => Check | null;
  probe?: (at: Date) => Check | null;
  localConfig?: () => Check;
  fleetTrust?: () => Check[];

  stuckSaves?: (at: Date) => Check[];
  watcher?: (at: Date) => Check | null;
  defsFetch?: () => Check | null;
}

export type Samples = Record<string, [string, number][]>;

export interface HealthTick {
  checks: Check[];
  opened: Check[];
  cleared: { key: string; line: string; since: string }[];
}

import type { Runner } from '../runner/types.ts';

export interface Check {
  key: string; // stable per problem, e.g. failed:user:foo.service
  ok: boolean;
  line: string;
}

export interface AtcMcpProcess {
  pid: number;
  sessionID: string | null;
  startedAtMs: number;

  // the exe link target; ends with ' (deleted)' once the file was replaced
  exe: string;
}

// The atc mcp processes plus the installed binary, or the error that stopped the read.
export type AtcMcpRead = { processes: AtcMcpProcess[]; binary: { path: string; mtimeMs: number } } | string;

// The filesystem and PATH reads the atc mcp reader makes; each throws as node:fs does.
export interface AtcMcpFiles {
  // where proc is mounted: /proc on Linux
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
  atcAnswers: () => Promise<string | null>; // null when atc answers, else the error
  // each session's atc mcp process, against the installed atc binary
  atcMcp?: () => Promise<AtcMcpRead>;

  // a declared fleet name for a session id
  sessionName?: (sessionID: string) => string | null;
  home: string;
  backup?: () => { lastOk: string | null; lastError: string | null; everRan: boolean };
  morning?: (at: Date) => Check | null;
  goalsDaily?: (at: Date) => Check | null;
  goalsWeekly?: (at: Date) => Check | null;
  defsTree?: (at: Date) => Check | null;

  // is hq-private's working tree on origin/main? A missing checkout is a fault
  privateTree?: (at: Date) => Check | null;

  // Has every grant on hq-private's main a named mark?
  grantMarks?: () => Check | null;
  probe?: (at: Date) => Check | null; // the Nix uptime probe: stopped, or an outage open
  // Are the machine-specific settings (env or the local file) all set?
  localConfig?: () => Check;
  fleetTrust?: () => Check[]; // is every fleet folder trusted by Claude Code?

  // Can hq read the answer to each save request it asked?
  stuckSaves?: (at: Date) => Check[];
  watcher?: (at: Date) => Check | null; // has the watcher completed a tick lately? // is hq-defs' working tree on origin/main?
  defsFetch?: () => Check | null; // can hq fetch the definitions' main (hq)? Checked at most hourly
}

export type Samples = Record<string, [string, number][]>;

export interface HealthTick {
  checks: Check[];
  opened: Check[];
  cleared: { key: string; line: string; since: string }[];
}

import type { Runner } from '../runner/types.ts';

export interface Check {
  key: string; // stable per problem, e.g. failed:user:foo.service
  ok: boolean;
  line: string;
}

export interface Probe {
  run: Runner;
  readFile: (path: string) => Promise<string>;
  atcAnswers: () => Promise<string | null>; // null when atc answers, else the error
  home: string;
  backup?: () => { lastOk: string | null; lastError: string | null; everRan: boolean };
  morning?: (at: Date) => Check | null;
  goalsDaily?: (at: Date) => Check | null;
  goalsWeekly?: (at: Date) => Check | null;
  defsTree?: (at: Date) => Check | null;

  // is hq-private's working tree on origin/main? A missing checkout is a fault
  privateTree?: (at: Date) => Check | null;
  probe?: (at: Date) => Check | null; // the Nix uptime probe: stopped, or an outage open
  // Are the machine-specific settings (env or the local file) all set?
  localConfig?: () => Check;
  fleetTrust?: () => Check[]; // is every fleet folder trusted by Claude Code?
  stuckSaves?: (at: Date) => Check[]; // can hq read the answer to each save request it asked?
  watcher?: (at: Date) => Check | null; // has the watcher completed a tick lately? // is hq-defs' working tree on origin/main?
  defsFetch?: () => Check | null; // can hq fetch the definitions' main (hq)? Checked at most hourly
}

export type Samples = Record<string, [string, number][]>;

export interface HealthTick {
  checks: Check[];
  opened: Check[];
  cleared: { key: string; line: string; since: string }[];
}

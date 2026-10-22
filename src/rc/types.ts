export interface RcState {
  state: 'on' | 'off' | 'unknown';
  why: string; // what the answer rests on, or what stopped it
}

export type PidFind = { pid: number } | { why: string };

export interface RcSources {
  findPid?: (sessionId: string) => PidFind;
  read?: () => string | null;
  alive?: (pid: number) => boolean;
  start?: (pid: number) => string | null;
  now?: () => number;
  boot?: () => number | null;
}

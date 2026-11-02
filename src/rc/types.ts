export interface RcState {
  state: 'on' | 'off' | 'unknown';
  why: string;
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

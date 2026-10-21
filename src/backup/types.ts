export interface BackupRun {
  at: string;
  ok: boolean;
  snapshot: string | null;
  remote: 'copied' | 'not configured' | string;
  error: string | null;
  seconds: number;
}

export interface Snapshot {
  short_id: string;
  time: string;
  paths: string[];
}

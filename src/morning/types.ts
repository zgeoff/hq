export interface JobRun {
  job: string;
  key: string; // the Sydney date, YYYY-MM-DD
  at: string;
  result: 'queued' | 'skipped';
  detail: string | null;
  outbox_key: string | null;
}

export interface Windows {
  date: string;
  yesterday: { from: Date; to: Date; label: string };
  today: { from: Date; to: Date; label: string };
}

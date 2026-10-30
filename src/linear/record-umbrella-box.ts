import type { Database } from 'bun:sqlite';

export interface RecordedUmbrellaBox {
  repo: string;
  number: number;
  issue: string;
  mergedAt: string;
}

// A re-sync of the same merge never resets an outcome already decided.
export function recordUmbrellaBox(db: Database, box: RecordedUmbrellaBox): void {
  db.query('INSERT INTO umbrella_boxes (repo, number, issue, merged_at) VALUES (?, ?, ?, ?) ON CONFLICT (repo, number, issue) DO NOTHING').run(box.repo, box.number, box.issue, box.mergedAt);
}

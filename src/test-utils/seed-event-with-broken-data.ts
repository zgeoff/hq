import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import type { TestDeps } from './test-deps.ts';

interface BrokenEvent {
  subject: string;
  subjectID: string;
  action: string;
  actor: string;
}

export function seedEventWithBrokenData(deps: TestDeps, input: Partial<BrokenEvent> = {}): void {
  // An event whose data is not JSON: logEvent always writes JSON.
  deps.db
    .query("INSERT INTO events (subject, subject_id, action, actor, at, data) VALUES (?, ?, ?, ?, ?, '{')")
    .run(input.subject ?? 'hq', input.subjectID ?? 'kettle', input.action ?? 'probe', input.actor ?? 'kettle-bot', iso(now()));
}

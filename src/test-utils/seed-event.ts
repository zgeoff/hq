import { logEvent } from '../log-event.ts';
import type { TestDeps } from './test-deps.ts';

interface NewEvent {
  subject: 'ask' | 'unblock' | 'hq' | 'run';
  subjectID: string;
  action: string;
  actor: string;
  from: string | null;
  to: string | null;
  data: Record<string, unknown>;
}

export function seedEvent(deps: TestDeps, input: Partial<NewEvent> = {}): number {
  return logEvent(deps.db, input.subject ?? 'hq', input.subjectID ?? 'kettle', input.action ?? 'probe', input.actor ?? 'kettle-bot', input.from ?? null, input.to ?? null, input.data ?? {});
}

import { updateRunSessions } from '../update-run-sessions.ts';
import type { TestDeps } from '../../test-utils/test-deps.ts';

interface NewRunSession {
  issue: string;
  session: string;
}

export function seedRunSession(deps: TestDeps, input: Partial<NewRunSession> = {}): void {
  updateRunSessions(deps.db, input.issue ?? 'GEO-9001', input.session ?? 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
}

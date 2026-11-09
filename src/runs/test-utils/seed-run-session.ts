import type { RunsDeps } from './types.ts';
import { updateRunSessions } from '../update-run-sessions.ts';
import { buildMockNewRunSession } from './build-mock-new-run-session.ts';
import type { NewRunSession } from './build-mock-new-run-session.ts';

export function seedRunSession(deps: RunsDeps, input: Partial<NewRunSession> = {}): void {
  const newSession = buildMockNewRunSession(input);
  updateRunSessions(deps.db, newSession.issue, newSession.session);
}

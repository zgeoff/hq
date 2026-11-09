import { logEvent } from '../log-event.ts';
import type { EventsDeps } from './types.ts';
import { buildMockNewEvent } from './build-mock-new-event.ts';
import type { NewEvent } from './build-mock-new-event.ts';

export function seedEvent(deps: EventsDeps, input: Partial<NewEvent> = {}): number {
  const event = buildMockNewEvent(input);

  return logEvent(deps.db, event.subject, event.subjectID, event.action, event.actor, event.from, event.to, event.data);
}

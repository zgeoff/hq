export interface NewEvent {
  subject: 'ask' | 'unblock' | 'hq' | 'run';
  subjectID: string;
  action: string;
  actor: string;
  from: string | null;
  to: string | null;
  data: Record<string, unknown>;
}

export function buildMockNewEvent(overrides: Partial<NewEvent> = {}): NewEvent {
  return { subject: 'hq', subjectID: 'kettle', action: 'probe', actor: 'kettle-bot', from: null, to: null, data: {}, ...overrides };
}

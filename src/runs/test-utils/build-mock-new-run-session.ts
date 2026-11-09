export interface NewRunSession {
  issue: string;
  session: string;
}

export function buildMockNewRunSession(overrides: Partial<NewRunSession> = {}): NewRunSession {
  return { issue: 'GEO-9001', session: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ...overrides };
}

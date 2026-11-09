export interface NewRunPR {
  issue: string;
  ref: string;
}

export function buildMockNewRunPR(overrides: Partial<NewRunPR> = {}): NewRunPR {
  return { issue: 'GEO-9001', ref: 'kettle#1', ...overrides };
}

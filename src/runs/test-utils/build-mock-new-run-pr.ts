export interface NewRunPr {
  issue: string;
  ref: string;
}

export function buildMockNewRunPr(overrides: Partial<NewRunPr> = {}): NewRunPr {
  return { issue: 'GEO-9001', ref: 'kettle#1', ...overrides };
}

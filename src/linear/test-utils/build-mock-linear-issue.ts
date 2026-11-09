import type { LinearIssue } from '../types.ts';

export function buildMockLinearIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return { issue: 'GEO-1', type: 'Feature', title: 'Descale the kettle', state: 'completed', closed_at: null, ...overrides };
}

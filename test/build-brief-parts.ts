import type { BriefParts } from '../src/brief/types.ts';

export function buildBriefParts(overrides: Partial<BriefParts> = {}): BriefParts {
  return {
    repo: 'kettle',
    issueID: 'GEO-9001',
    sections: [],
    permissions: 'Work in kettle.',
    stack: '',
    fixes: 'Fixes',
    reviewLines: '',
    notYours: '',
    impLine: '',
    goalFile: '',
    goalReview: '',
    ...overrides,
  };
}

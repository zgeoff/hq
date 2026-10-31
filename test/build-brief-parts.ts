import type { BriefParts } from '../src/brief/types.ts';

// The parts of a brief for an invented kettle issue, with each field the caller gives replaced.
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
    ...overrides,
  };
}

import type { AddInput } from '../types.ts';

export function buildMockAddInput(overrides: Partial<AddInput> = {}): AddInput {
  return {
    kind: 'call',
    id: 'geo-1-paint',
    title: 'Paint the shed',
    question: 'Green or grey?',
    body: 'The shed needs paint. Green or grey? Recommendation: green.',
    issues: ['GEO-1'],
    forSession: 'z-delivery',
    actor: 'z-refine',
    ...overrides,
  };
}

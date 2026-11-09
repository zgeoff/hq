import { expect, test } from 'bun:test';
import { buildMockAddInput } from './build-mock-add-input.ts';

test('it builds a default call', () => {
  expect(buildMockAddInput()).toStrictEqual({
    kind: 'call',
    id: 'geo-1-paint',
    title: 'Paint the shed',
    question: 'Green or grey?',
    body: 'The shed needs paint. Green or grey? Recommendation: green.',
    issues: ['GEO-1'],
    forSession: 'z-delivery',
    actor: 'z-refine',
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockAddInput({ kind: 'proposal', id: 'tidy-docs' })).toMatchObject({ kind: 'proposal', id: 'tidy-docs', title: 'Paint the shed' });
});

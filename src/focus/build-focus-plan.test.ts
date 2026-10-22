import { expect, test } from 'bun:test';
import { buildReadyIssue } from '../../test/build-ready-issue.ts';
import { buildFocusPlan } from './build-focus-plan.ts';
import { buildFocusQueue } from './build-focus-queue.ts';
import { parseFocusTerms } from './parse-focus-terms.ts';

test('a free slot takes other eligible work once the focus work is exhausted', () => {
  const queue = buildFocusQueue([buildReadyIssue('GEO-9801', { type: 'Bug' }), buildReadyIssue('GEO-9802', { type: 'Feature' })], parseFocusTerms('bug'), new Set());

  const plan = buildFocusPlan(queue, 2, [], {});

  expect(plan).toStrictEqual({
    picks: [
      { issue: 'GEO-9801', term: 0, reserve: null },
      { issue: 'GEO-9802', term: null, reserve: null },
    ],
    lent: [],
  });
});

test('a reserve keeps its slot for its area ahead of the focus terms', () => {
  const queue = buildFocusQueue([buildReadyIssue('GEO-9801', { type: 'Bug' }), buildReadyIssue('GEO-9802', { type: 'Feature', labels: ['nixie'] })], parseFocusTerms('bug'), new Set());

  const plan = buildFocusPlan(queue, 1, [{ area: 'nixie', slots: 1 }], {});

  expect(plan).toStrictEqual({ picks: [{ issue: 'GEO-9802', term: null, reserve: 'nixie' }], lent: [] });
});

test('a reserved slot with nothing eligible in its area is lent to other work', () => {
  const queue = buildFocusQueue([buildReadyIssue('GEO-9801', { type: 'Bug' }), buildReadyIssue('GEO-9802', { type: 'Feature' })], parseFocusTerms('bug'), new Set());

  const plan = buildFocusPlan(queue, 2, [{ area: 'nixie', slots: 1 }], {});

  expect(plan).toStrictEqual({
    picks: [
      { issue: 'GEO-9801', term: 0, reserve: null },
      { issue: 'GEO-9802', term: null, reserve: null },
    ],
    lent: [{ area: 'nixie', slots: 1 }],
  });
});

test('a reserve its running runs already fill keeps no free slot', () => {
  const queue = buildFocusQueue([buildReadyIssue('GEO-9801', { type: 'Bug' }), buildReadyIssue('GEO-9802', { labels: ['nixie'] })], parseFocusTerms('bug'), new Set());

  const plan = buildFocusPlan(queue, 1, [{ area: 'nixie', slots: 1 }], { nixie: 1 });

  expect(plan).toStrictEqual({ picks: [{ issue: 'GEO-9801', term: 0, reserve: null }], lent: [] });
});

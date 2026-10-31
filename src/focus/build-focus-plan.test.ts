import { expect, test } from 'bun:test';
import { buildReadyIssue } from '../../test/build-ready-issue.ts';
import { buildFocusPlan } from './build-focus-plan.ts';
import { buildFocusQueue } from './build-focus-queue.ts';
import { parseFocusTerms } from './parse-focus-terms.ts';

test('a free slot takes other eligible work once the focus work is exhausted', () => {
  const queue = buildFocusQueue([buildReadyIssue('GEO-9801', { type: 'Bug' }), buildReadyIssue('GEO-9802', { type: 'Feature' })], parseFocusTerms('bug'), new Set());

  const plan = buildFocusPlan(queue, { free: 2, places: null }, [], {});

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

  const plan = buildFocusPlan(queue, { free: 1, places: null }, [{ area: 'nixie', slots: 1 }], {});

  expect(plan).toStrictEqual({ picks: [{ issue: 'GEO-9802', term: null, reserve: 'nixie' }], lent: [] });
});

test('a reserved slot with nothing eligible in its area is lent to other work', () => {
  const queue = buildFocusQueue([buildReadyIssue('GEO-9801', { type: 'Bug' }), buildReadyIssue('GEO-9802', { type: 'Feature' })], parseFocusTerms('bug'), new Set());

  const plan = buildFocusPlan(queue, { free: 2, places: null }, [{ area: 'nixie', slots: 1 }], {});

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

  const plan = buildFocusPlan(queue, { free: 1, places: null }, [{ area: 'nixie', slots: 1 }], { nixie: 1 });

  expect(plan).toStrictEqual({ picks: [{ issue: 'GEO-9801', term: 0, reserve: null }], lent: [] });
});

test('it gives an issue with no Type label a slot only at a place with no list', () => {
  const queue = buildFocusQueue([buildReadyIssue('GEO-9861'), buildReadyIssue('GEO-9862', { type: 'Investigation' })], [], new Set());

  const plan = buildFocusPlan(queue, { free: 2, places: { free: { imp: 1, local: 1 }, types: { local: ['Investigation'] } } }, [], {});

  expect(plan.picks).toStrictEqual([
    { issue: 'GEO-9861', term: null, reserve: null, place: 'imp' },
    { issue: 'GEO-9862', term: null, reserve: null, place: 'local' },
  ]);
});

test('it leaves an issue with no Type label out when only a listed place has a free slot', () => {
  const queue = buildFocusQueue([buildReadyIssue('GEO-9863')], [], new Set());

  const plan = buildFocusPlan(queue, { free: 1, places: { free: { imp: 0, local: 1 }, types: { local: ['Investigation'] } } }, [], {});

  expect(plan).toStrictEqual({ picks: [], lent: [], unfit: { slots: 1, places: [{ place: 'local', types: ['Investigation'] }] } });
});

test('it matches Type names whatever their case', () => {
  const queue = buildFocusQueue([buildReadyIssue('GEO-9864', { type: 'Investigation' })], [], new Set());

  const plan = buildFocusPlan(queue, { free: 1, places: { free: { imp: 0, local: 1 }, types: { local: ['iNVESTIGATION'] } } }, [], {});

  expect(plan).toStrictEqual({ picks: [{ issue: 'GEO-9864', term: null, reserve: null, place: 'local' }], lent: [], unfit: { slots: 0, places: [] } });
});

test('it gives an issue that fits both places the listed one, so a later Bug keeps the unlisted slot', () => {
  const queue = buildFocusQueue([buildReadyIssue('GEO-9865', { type: 'Investigation' }), buildReadyIssue('GEO-9866', { type: 'Bug' })], [], new Set());

  const plan = buildFocusPlan(queue, { free: 2, places: { free: { imp: 1, local: 1 }, types: { local: ['Investigation'] } } }, [], {});

  expect(plan.picks).toStrictEqual([
    { issue: 'GEO-9865', term: null, reserve: null, place: 'local' },
    { issue: 'GEO-9866', term: null, reserve: null, place: 'imp' },
  ]);
});

test('it fills a reserved slot only with an issue of its area that a free place takes, and lends the rest', () => {
  const queue = buildFocusQueue([buildReadyIssue('GEO-9867', { type: 'Bug', labels: ['nixie'] }), buildReadyIssue('GEO-9868', { type: 'Investigation' })], [], new Set());

  const plan = buildFocusPlan(queue, { free: 1, places: { free: { imp: 0, local: 1 }, types: { local: ['Investigation'] } } }, [{ area: 'nixie', slots: 1 }], {});

  expect(plan).toStrictEqual({ picks: [{ issue: 'GEO-9868', term: null, reserve: null, place: 'local' }], lent: [{ area: 'nixie', slots: 1 }], unfit: { slots: 0, places: [] } });
});

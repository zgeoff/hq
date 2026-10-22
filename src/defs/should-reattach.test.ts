import { expect, test } from 'bun:test';
import { shouldReattach } from './should-reattach.ts';

test.each([
  ['a clean detached HEAD on origin/main with local main behind it', { onBranch: false, hasOriginMain: true, clean: true, headOnOriginMain: true, hasLocalMain: true, localMainOnOriginMain: true }, true],
  ['a clean detached HEAD on origin/main with no local main', { onBranch: false, hasOriginMain: true, clean: true, headOnOriginMain: true, hasLocalMain: false, localMainOnOriginMain: false }, true],
  ['a HEAD on a branch', { onBranch: true, hasOriginMain: true, clean: true, headOnOriginMain: true, hasLocalMain: true, localMainOnOriginMain: true }, false],
  ['no origin/main', { onBranch: false, hasOriginMain: false, clean: true, headOnOriginMain: true, hasLocalMain: true, localMainOnOriginMain: true }, false],
  ['a dirty tree', { onBranch: false, hasOriginMain: true, clean: false, headOnOriginMain: true, hasLocalMain: true, localMainOnOriginMain: true }, false],
  ['a HEAD origin/main lacks', { onBranch: false, hasOriginMain: true, clean: true, headOnOriginMain: false, hasLocalMain: true, localMainOnOriginMain: true }, false],
  ['a local main ahead of origin/main', { onBranch: false, hasOriginMain: true, clean: true, headOnOriginMain: true, hasLocalMain: true, localMainOnOriginMain: false }, false],
])('it decides re-attaching for %s: %p', (_label, facts, expected) => {
  expect(shouldReattach(facts)).toBe(expected);
});

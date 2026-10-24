import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { writeLaneSkip } from './write-lane-skip.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, at: new Date('2026-10-15T20:00:00Z') };
}

test('it stores a skip until a PR in its short form', () => {
  const ctx = setupTest();

  const skip = writeLaneSkip(ctx.db, { issue: 'GEO-9901', until: 'pr:zgeoff/impz#654', reason: 'waits on the kettle PR', actor: 'z-delivery', at: ctx.at });

  expect(skip.until).toBe('pr:impz#654');
});

test('it stores a skip until a PR given as a github URL', () => {
  const ctx = setupTest();

  const skip = writeLaneSkip(ctx.db, { issue: 'GEO-9901', until: 'pr:https://github.com/zgeoff/impz/pull/654', reason: 'waits on the kettle PR', actor: 'z-delivery', at: ctx.at });

  expect(skip.until).toBe('pr:impz#654');
});

test('it refuses a skip until a PR of another owner', () => {
  const ctx = setupTest();

  expect(() => writeLaneSkip(ctx.db, { issue: 'GEO-9901', until: 'pr:other/impz#1', reason: 'waits', actor: 'z-delivery', at: ctx.at })).toThrow('hq reads only zgeoff PRs');
});

test('it refuses a skip until a PR of another owner written as a URL in any form', () => {
  const ctx = setupTest();
  const forms = ['pr:github.com/other/impz/pull/1', 'pr:www.github.com/other/impz/pull/1', 'pr:https://www.github.com/other/impz/pull/1', 'pr:<https://github.com/other/impz/pull/1>'];

  const refused = forms.map((until) => {
    try {
      writeLaneSkip(ctx.db, { issue: 'GEO-9901', until, reason: 'waits', actor: 'z-delivery', at: ctx.at });
      return 'accepted';
    } catch (error) {
      return error instanceof Error ? error.message : 'unknown';
    }
  });

  expect(refused).toStrictEqual(forms.map(() => '--until pr:other/... is refused: hq reads only zgeoff PRs'));
});

test('it accepts the zgeoff owner in any letter case', () => {
  const ctx = setupTest();

  const skip = writeLaneSkip(ctx.db, { issue: 'GEO-9901', until: 'pr:ZGeoff/impz#654', reason: 'waits', actor: 'z-delivery', at: ctx.at });

  expect(skip.until).toBe('pr:impz#654');
});

test('it refuses a PR until that names no PR', () => {
  const ctx = setupTest();

  expect(() => writeLaneSkip(ctx.db, { issue: 'GEO-9901', until: 'pr:nonsense', reason: 'waits', actor: 'z-delivery', at: ctx.at })).toThrow('--until takes an ISO time');
});

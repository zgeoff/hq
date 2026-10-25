import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { logEvent } from '../log-event.ts';
import { findOwnerOverride } from './find-owner-override.ts';
import { readHeadCIOverrides } from './read-head-ci-overrides.ts';
import { recordCICheckOverride } from './record-ci-check-override.ts';
import { recordPROverride } from './record-pr-override.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it reads the CI overrides recorded at the head, newest record of a check winning', () => {
  const ctx = setupTest();
  recordCICheckOverride(ctx.db, { repo: 'widgets', pr: 7, head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-1', note: 'First.', actor: 'z-kettle', check: 'preview' });
  recordCICheckOverride(ctx.db, { repo: 'widgets', pr: 7, head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-2', note: 'Second.', actor: 'z-kettle', check: 'preview' });
  recordCICheckOverride(ctx.db, { repo: 'widgets', pr: 7, head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-3', note: 'Lint.', actor: 'z-kettle', check: 'lint' });

  expect(readHeadCIOverrides(ctx.db, 'widgets', 7, 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2')).toMatchObject([
    { check: 'preview', source: 'chat:kettle-2', note: 'Second.' },
    { check: 'lint', source: 'chat:kettle-3' },
  ]);
});

test.each([
  ['at another head', 'pr:widgets#7', 'e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1', 'chat:kettle-1'],
  ['on another PR', 'pr:widgets#8', 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', 'chat:kettle-1'],
  ['at a short form of the head', 'pr:widgets#7', 'b2b2b2b', 'chat:kettle-1'],
  ["from a session's own words", 'pr:widgets#7', 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', 'session:z-kettle'],
])('it reads no CI override %s', (_label, subjectID, head, source) => {
  const ctx = setupTest();
  logEvent(ctx.db, 'hq', subjectID, 'pr-override', 'z-kettle', null, null, { head, source, note: 'Rebased.', scope: 'ci-check', check: 'preview' });

  expect(readHeadCIOverrides(ctx.db, 'widgets', 7, 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2')).toStrictEqual([]);
});

test.each([
  ['names no check', { head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-2', note: 'Bad.', scope: 'ci-check' }],
  ['names an empty check', { head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-2', note: 'Bad.', scope: 'ci-check', check: '' }],
  ['has no head', { source: 'chat:kettle-2', note: 'Bad.', scope: 'ci-check', check: 'preview' }],
  ['is a findings override with no note', { head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-2', scope: 'open-findings' }],
])('it reads no CI override once an override event %s', (_label, data) => {
  const ctx = setupTest();
  recordCICheckOverride(ctx.db, { repo: 'widgets', pr: 7, head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-1', note: 'Fine.', actor: 'z-kettle', check: 'preview' });
  logEvent(ctx.db, 'hq', 'pr:widgets#7', 'pr-override', 'z-kettle', null, null, data);

  expect(readHeadCIOverrides(ctx.db, 'widgets', 7, 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2')).toStrictEqual([]);
});

test('it reads no CI override from a findings override', () => {
  const ctx = setupTest();
  recordPROverride(ctx.db, { repo: 'widgets', pr: 7, head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-1', note: 'Fine.', actor: 'z-kettle' });

  expect(readHeadCIOverrides(ctx.db, 'widgets', 7, 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2')).toStrictEqual([]);
});

test('it does not count a CI override as a findings override', () => {
  const ctx = setupTest();
  recordCICheckOverride(ctx.db, { repo: 'widgets', pr: 7, head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-1', note: 'Fine.', actor: 'z-kettle', check: 'preview' });

  expect(findOwnerOverride(ctx.db, 'widgets', 7, 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2')).toBeNull();
});

import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { logEvent } from '../log-event.ts';
import { readOwnerOverride } from './read-owner-override.ts';
import { recordCICheckOverride } from './record-ci-check-override.ts';
import { recordPROverride } from './record-pr-override.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it finds the newest override, whatever its head', () => {
  const ctx = setupTest();
  recordPROverride(ctx.db, { repo: 'widgets', pr: 7, head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-1', note: 'First.', actor: 'z-kettle' });
  recordPROverride(ctx.db, { repo: 'widgets', pr: 7, head: 'e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1', source: 'console:kettle-2', note: 'Second.', actor: 'z-kettle' });

  expect(readOwnerOverride(ctx.db, 'widgets', 7)).toMatchObject({ head: 'e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1', source: 'console:kettle-2', note: 'Second.' });
});

test('it finds nothing for an override on another PR', () => {
  const ctx = setupTest();
  recordPROverride(ctx.db, { repo: 'widgets', pr: 8, head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-1', note: 'Other PR.', actor: 'z-kettle' });

  expect(readOwnerOverride(ctx.db, 'widgets', 7)).toBeNull();
});

test("it finds nothing for a session's own words", () => {
  const ctx = setupTest();
  recordPROverride(ctx.db, { repo: 'widgets', pr: 7, head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'session:z-kettle', note: 'Mine.', actor: 'z-kettle' });

  expect(readOwnerOverride(ctx.db, 'widgets', 7)).toBeNull();
});

test('it finds nothing when any override event does not parse', () => {
  const ctx = setupTest();
  recordPROverride(ctx.db, { repo: 'widgets', pr: 7, head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-1', note: 'Fine.', actor: 'z-kettle' });
  logEvent(ctx.db, 'hq', 'pr:widgets#7', 'pr-override', 'z-kettle', null, null, { head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2' });

  expect(readOwnerOverride(ctx.db, 'widgets', 7)).toBeNull();
});

test('it finds nothing for an override logged before 0.80.0, which carries no scope', () => {
  const ctx = setupTest();
  logEvent(ctx.db, 'hq', 'pr:widgets#7', 'pr-override', 'z-kettle', null, null, { head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-1', note: 'Old.' });

  expect(readOwnerOverride(ctx.db, 'widgets', 7)).toBeNull();
});

test('it finds a scoped override after one logged before 0.80.0', () => {
  const ctx = setupTest();
  logEvent(ctx.db, 'hq', 'pr:widgets#7', 'pr-override', 'z-kettle', null, null, { head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-1', note: 'Old.' });
  recordPROverride(ctx.db, { repo: 'widgets', pr: 7, head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-2', note: 'Again.', actor: 'z-kettle' });

  expect(readOwnerOverride(ctx.db, 'widgets', 7)).toMatchObject({ source: 'chat:kettle-2', scope: 'open-findings' });
});

test('it does not count a CI override as a findings override', () => {
  const ctx = setupTest();
  recordCICheckOverride(ctx.db, { repo: 'widgets', pr: 7, head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', source: 'chat:kettle-1', note: 'Fine.', actor: 'z-kettle', check: 'preview' });

  expect(readOwnerOverride(ctx.db, 'widgets', 7)).toBeNull();
});

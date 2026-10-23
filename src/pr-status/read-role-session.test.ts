import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import type { OwnerProbeClient } from './read-owner-session.ts';
import { readRoleSession } from './read-role-session.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const opened: string[] = [];
  const client = (id: string): OwnerProbeClient => ({
    resolve: (target) => {
      opened.push(target);
      return Promise.resolve({ id });
    },
    close: () => {},
  });
  return { db: fresh.db, opened, client };
}

test('it matches a caller whose atc session is the role session', async () => {
  const ctx = setupTest();

  const probe = await readRoleSession(ctx.db, { sessionID: 'kettle-1', openClient: () => Promise.resolve(ctx.client('kettle-1')) }, 'reviewer');

  expect({ probe, opened: ctx.opened }).toStrictEqual({ probe: { verdict: 'match' }, opened: ['z-review'] });
});

test('it refuses a caller whose atc session is another session', async () => {
  const ctx = setupTest();

  const probe = await readRoleSession(ctx.db, { sessionID: 'kettle-2', openClient: () => Promise.resolve(ctx.client('kettle-1')) }, 'reviewer');

  expect(probe).toStrictEqual({ verdict: 'other' });
});

test('it refuses a caller with no session id without asking atc', async () => {
  const ctx = setupTest();

  const probe = await readRoleSession(ctx.db, { openClient: () => Promise.resolve(ctx.client('kettle-1')) }, 'reviewer');

  expect({ probe, opened: ctx.opened }).toStrictEqual({ probe: { verdict: 'other' }, opened: [] });
});

test('it gives the cause when atc cannot answer', async () => {
  const ctx = setupTest();

  const probe = await readRoleSession(ctx.db, { sessionID: 'kettle-1', openClient: () => Promise.reject(new Error('connect ENOENT /run/teapot.sock')) }, 'reviewer');

  expect(probe).toStrictEqual({ verdict: 'unknown', cause: 'connect ENOENT /run/teapot.sock' });
});

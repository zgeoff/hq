import { expect, onTestFinished, test } from 'bun:test';
import { setMeta } from '../db/set-meta.ts';
import { freshDb } from '../../test/helpers.ts';
import type { OwnerProbeClient } from './read-owner-session.ts';
import { readRoleSession } from './read-role-session.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const closed: string[] = [];
  const client = (peerSession: string | null | undefined): OwnerProbeClient => ({
    peerSession,
    close: () => {
      closed.push('closed');
    },
  });
  return { db: fresh.db, closed, client };
}

test("it matches a caller whose kernel-found session is the role's recorded session", async () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'z-review': 'kettle-1' }));

  const probe = await readRoleSession(ctx.db, { openClient: () => Promise.resolve(ctx.client('kettle-1')) }, 'reviewer');

  expect({ probe, closed: ctx.closed }).toStrictEqual({ probe: { verdict: 'match' }, closed: ['closed'] });
});

test('it refuses a caller whose kernel-found session is another session, whatever ATC_SESSION_ID says', async () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'z-review': 'kettle-1' }));
  const saved = process.env['ATC_SESSION_ID'];
  process.env['ATC_SESSION_ID'] = 'kettle-1';
  onTestFinished(() => {
    if (saved === undefined) {
      delete process.env['ATC_SESSION_ID'];
    } else {
      process.env['ATC_SESSION_ID'] = saved;
    }
  });

  const probe = await readRoleSession(ctx.db, { openClient: () => Promise.resolve(ctx.client('kettle-2')) }, 'reviewer');

  expect(probe).toStrictEqual({ verdict: 'other' });
});

test('it refuses a caller the daemon finds in no session', async () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'z-review': 'kettle-1' }));

  const probe = await readRoleSession(ctx.db, { openClient: () => Promise.resolve(ctx.client(null)) }, 'reviewer');

  expect(probe).toStrictEqual({ verdict: 'other' });
});

test('it fails closed, with the reason, when the daemon names no caller session at all', async () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'z-review': 'kettle-1' }));

  const probe = await readRoleSession(ctx.db, { openClient: () => Promise.resolve(ctx.client(undefined)) }, 'reviewer');

  expect(probe).toStrictEqual({ verdict: 'unknown', cause: "atc's hello names no caller session, so this daemon predates protocol 11 and cannot say who is asking" });
});

test('it refuses, without asking atc, when hq has recorded no session id for the role', async () => {
  const ctx = setupTest();
  let opened = false;

  const probe = await readRoleSession(
    ctx.db,
    {
      openClient: () => {
        opened = true;
        return Promise.resolve(ctx.client('kettle-1'));
      },
    },
    'reviewer',
  );

  expect({ probe, opened }).toStrictEqual({ probe: { verdict: 'other' }, opened: false });
});

test('it gives the cause when atc cannot answer', async () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'z-review': 'kettle-1' }));

  const probe = await readRoleSession(ctx.db, { openClient: () => Promise.reject(new Error('connect ENOENT /run/teapot.sock')) }, 'reviewer');

  expect(probe).toStrictEqual({ verdict: 'unknown', cause: 'connect ENOENT /run/teapot.sock' });
});

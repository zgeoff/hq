import { expect, onTestFinished, test } from 'bun:test';
import { setMeta } from '../db/set-meta.ts';
import { freshDb } from '../../test/helpers.ts';
import { readOwnerSession } from './read-owner-session.ts';
import type { OwnerProbeClient } from './read-owner-session.ts';

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
  return { db: fresh.db, client, closed };
}

test("it accepts the caller atc finds in the owner's recorded session", async () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'z-stu': 'sess-owner' }));

  await expect(readOwnerSession(ctx.db, { openClient: () => Promise.resolve(ctx.client('sess-owner')) })).resolves.toStrictEqual({ verdict: 'owner' });
});

test("it refuses another session, even one HQ_AS names as the owner", async () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'z-stu': 'sess-owner' }));
  const saved = process.env['HQ_AS'];
  process.env['HQ_AS'] = 'z-stu';
  onTestFinished(() => {
    if (saved === undefined) {
      delete process.env['HQ_AS'];
    } else {
      process.env['HQ_AS'] = saved;
    }
  });

  await expect(readOwnerSession(ctx.db, { openClient: () => Promise.resolve(ctx.client('sess-kettle')) })).resolves.toStrictEqual({ verdict: 'other' });
});

test('it keeps the cause when atc is unreachable, rather than calling the caller another session', async () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'z-stu': 'sess-owner' }));

  await expect(readOwnerSession(ctx.db, { openClient: () => Promise.reject(new Error('no socket')) })).resolves.toStrictEqual({ verdict: 'unknown', cause: 'no socket' });
});

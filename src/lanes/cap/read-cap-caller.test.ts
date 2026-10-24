import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { overrideEnv } from '../../config/override-env.ts';
import { setMeta } from '../../db/set-meta.ts';
import { readCapCaller } from './read-cap-caller.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test("it finds the owner by the session atc found for the caller's process", async () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'z-stu': 'kettle-1', 'z-delivery': 'kettle-2' }));

  const caller = await readCapCaller(ctx.db, { openClient: () => Promise.resolve({ peerSession: 'kettle-1', close: () => {} }) });

  expect(caller).toStrictEqual({ kind: 'owner', by: 'z-stu' });
});

test('it finds the delivery lead by its recorded session', async () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'z-stu': 'kettle-1', 'z-delivery': 'kettle-2' }));

  const caller = await readCapCaller(ctx.db, { openClient: () => Promise.resolve({ peerSession: 'kettle-2', close: () => {} }) });

  expect(caller).toStrictEqual({ kind: 'delivery', by: 'z-delivery' });
});

test("it ignores the caller's own claim of who it is", async () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'z-stu': 'kettle-1', 'z-delivery': 'kettle-2' }));
  onTestFinished(overrideEnv('ATC_SESSION_ID', 'kettle-1'));
  onTestFinished(overrideEnv('HQ_AS', 'z-stu'));

  const caller = await readCapCaller(ctx.db, { openClient: () => Promise.resolve({ peerSession: 'kettle-9', close: () => {} }) });

  expect(caller).toStrictEqual({ kind: 'other' });
});

test('it finds no one when atc places the caller in no session', async () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'z-stu': 'kettle-1' }));

  const caller = await readCapCaller(ctx.db, { openClient: () => Promise.resolve({ peerSession: null, close: () => {} }) });

  expect(caller).toStrictEqual({ kind: 'other' });
});

test('it matches no role while hq fleet has recorded none', async () => {
  const ctx = setupTest();

  const caller = await readCapCaller(ctx.db, { openClient: () => Promise.resolve({ peerSession: '', close: () => {} }) });

  expect(caller).toStrictEqual({ kind: 'other' });
});

test('it reports unknown, with the reason, when atc cannot be reached', async () => {
  const ctx = setupTest();

  const caller = await readCapCaller(ctx.db, { openClient: () => Promise.reject(new Error('connect ENOENT atc.sock')) });

  expect(caller).toStrictEqual({ kind: 'unknown', cause: 'connect ENOENT atc.sock' });
});

test('it reports unknown when the daemon names no caller session', async () => {
  const ctx = setupTest();

  const caller = await readCapCaller(ctx.db, { openClient: () => Promise.resolve({ peerSession: undefined, close: () => {} }) });

  expect(caller.kind).toBe('unknown');
});

import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { buildFakeRunner } from '../../test/noslop-fake.ts';
import type { Flags } from '../cli.ts';
import { parsePRRef } from './parse-pr-ref.ts';
import type { OwnerProbe } from './read-owner-session.ts';
import { requireOwnerSource } from './require-owner-source.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return {
    require: async (flags: Flags, probe: OwnerProbe) =>
      await requireOwnerSource(
        { run: buildFakeRunner().run, db: fresh.db, verb: 'accept-risk', rest: [], flags, actor: () => Promise.resolve('z-kettle'), readOwnerSession: () => Promise.resolve(probe), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) },
        { ref: parsePRRef('widgets', '7'), wanted: { action: 'accept-risk', finding: 'aaaaaaaaaaaaaaaa' } },
      ),
  };
}

test.each([
  { name: 'no source', flags: {}, probe: { verdict: 'owner' } },
  { name: 'a blank source', flags: { source: '  ' }, probe: { verdict: 'owner' } },
  { name: 'a typed source', flags: { source: 'typed:stu' }, probe: { verdict: 'owner' } },
  { name: 'a rebased source', flags: { source: 'rebased:a1b2c3d' }, probe: { verdict: 'owner' } },
  { name: "a chat source from a session that isn't the owner's", flags: { source: 'chat:kettle-1' }, probe: { verdict: 'other' } },
  { name: 'a chat source atc cannot place', flags: { source: 'chat:kettle-1' }, probe: { verdict: 'unknown', cause: 'atc is down' } },
  { name: 'a call hq does not hold', flags: { source: 'call:KET-404' }, probe: { verdict: 'owner' } },
  { name: 'a console answer hq does not hold', flags: { source: 'console:KET-404' }, probe: { verdict: 'owner' } },
] satisfies { name: string; flags: Flags; probe: OwnerProbe }[])('#requireOwnerSource refuses $name', async (row) => {
  const ctx = setupTest();

  await expect(ctx.require(row.flags, row.probe)).rejects.toMatchObject({ code: 'bad_args' });
});

test("#requireOwnerSource takes a chat source from the owner's own session", async () => {
  const ctx = setupTest();

  await expect(ctx.require({ source: 'chat:kettle-1' }, { verdict: 'owner' })).resolves.toBe('chat:kettle-1');
});

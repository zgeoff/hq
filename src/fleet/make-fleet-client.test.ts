import { expect, onTestFinished, test } from 'bun:test';
import { AtcClient } from '../atc/atc-client.ts';
import { fakeAtc, freshDb } from '../../test/helpers.ts';
import { makeFleetClient } from './make-fleet-client.ts';

async function setupTest() {
  const base = freshDb();
  onTestFinished(base.cleanup);
  const server = fakeAtc(base.dir, [{ id: '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running' }]);
  onTestFinished(server.stop);
  const atc = await AtcClient.open(server.path);
  onTestFinished(() => atc.close());
  return { server, client: makeFleetClient(atc) };
}

test('forgetLive asks atc to forget a live session, which stops it, and keeps refusing a pinned one', async () => {
  const ctx = await setupTest();

  await ctx.client.forgetLive?.('0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  await ctx.client.forgetLive?.('0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'token-kettle');

  expect(ctx.server.calls).toStrictEqual([
    { method: 'session.forget', input: { session: '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', refusePinned: true, refuseLive: false } },
    { method: 'session.forget', input: { session: '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', refusePinned: true, refuseLive: false, confirmToken: 'token-kettle' } },
  ]);
});

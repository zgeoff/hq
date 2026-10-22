import { expect, test } from 'bun:test';
import { buildStubFleetClient } from './build-stub-fleet-client.ts';

test('the client lists the given sessions and records each session operation with a short id', async () => {
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true }] });

  const sessions = await fleet.client.sessions();
  await fleet.client.unpin('0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  await fleet.client.kill('0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  await fleet.client.pin('0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

  expect(sessions).toStrictEqual([{ id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true }]);
  expect(fleet.calls).toStrictEqual(['unpin 0000a001', 'kill 0000a001', 'pin 0000a001']);
});

test('a forget answers the scripted answers for its session in turn, then forgets the session', async () => {
  const fleet = buildStubFleetClient({ sessions: [], forgets: { '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa': [{ forgotten: false, confirmToken: 'token-kettle' }, { forgotten: false }] } });

  const first = await fleet.client.forget('0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  const second = await fleet.client.forget('0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'token-kettle');
  const third = await fleet.client.forget('0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  const other = await fleet.client.forget('0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

  expect([first, second, third, other]).toStrictEqual([{ forgotten: false, confirmToken: 'token-kettle' }, { forgotten: false }, { forgotten: true }, { forgotten: true }]);
  expect(fleet.calls).toStrictEqual(['forget 0000a001', 'forget 0000a001 token-kettle', 'forget 0000a001', 'forget 0000a002']);
});

test('a pin of a session atc refuses to pin fails, and is recorded', async () => {
  const fleet = buildStubFleetClient({ sessions: [], pinFailures: ['0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] });

  const refused = fleet.client.pin('0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

  await expect(refused).rejects.toThrow('atc refused the pin');
  expect(fleet.calls).toStrictEqual(['pin 0000a001']);
});

test('the client spawns nothing and reads no details or message', async () => {
  const fleet = buildStubFleetClient({ sessions: [] });

  const spawned = fleet.client.spawn({ cwd: '/kettle', name: 'kettle-agent', prompt: 'boil', model: 'opus', agent: 'claude', idempotencyKey: 'kettle-1' });
  const details = fleet.client.details('0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  const message = fleet.client.message('m-1');

  await expect(spawned).rejects.toThrow('the stub fleet client spawns nothing');
  await expect(details).rejects.toThrow('the stub fleet client reads no details');
  await expect(message).rejects.toThrow('the stub fleet client reads no message');
});

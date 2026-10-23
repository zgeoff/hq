import { expect, test } from 'bun:test';
import { buildStubFleetClient } from '../../test/build-stub-fleet-client.ts';
import { forgetWrappedSession } from './forget-wrapped-session.ts';

test('it stops, unpins and forgets the session', async () => {
  const fleet = buildStubFleetClient({ sessions: [] });

  await forgetWrappedSession(fleet.client, '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

  expect(fleet.calls).toStrictEqual(['kill 0000c001', 'unpin 0000c001', 'forget 0000c001']);
});

test('a forget atc refuses fails and leaves the session unpinned', async () => {
  const fleet = buildStubFleetClient({ sessions: [], forgets: { '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa': [{ forgotten: false }] } });

  const forgot = forgetWrappedSession(fleet.client, '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

  await expect(forgot).rejects.toThrow('atc did not forget the session');
  expect(fleet.calls).toStrictEqual(['kill 0000c001', 'unpin 0000c001', 'forget 0000c001']);
});

test('a forget that asks to destroy the host fails, since this forget never destroys one', async () => {
  const fleet = buildStubFleetClient({ sessions: [], forgets: { '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa': [{ forgotten: false, confirmToken: 'token-kettle' }] } });

  const forgot = forgetWrappedSession(fleet.client, '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

  await expect(forgot).rejects.toThrow("atc asked to destroy the session's host, which this forget never does");
  expect(fleet.calls).toStrictEqual(['kill 0000c001', 'unpin 0000c001', 'forget 0000c001']);
});

import { expect, test } from 'bun:test';
import { setImmediate } from 'node:timers/promises';
import { buildHeldLinearCall } from './build-held-linear-call.ts';

test('it answers the Ready query with what the test settles it to', async () => {
  const held = buildHeldLinearCall();

  const answer = held.call('query', { state: 'Ready', after: null });
  held.ready.resolve({ issues: { nodes: [] } });
  const settled = await answer;

  expect(settled).toStrictEqual({ issues: { nodes: [] } });
});

test('it answers the Backlog query with what the test settles it to', async () => {
  const held = buildHeldLinearCall();

  const answer = held.call('query', { state: 'Backlog' });
  held.backlog.resolve({ issues: { nodes: [{ identifier: 'GEO-9901' }] } });
  const settled = await answer;

  expect(settled).toStrictEqual({ issues: { nodes: [{ identifier: 'GEO-9901' }] } });
});

test('it leaves a query unanswered until the test settles it', async () => {
  const held = buildHeldLinearCall();

  const first = await Promise.race([held.call('query', { state: 'Ready', after: null }).then(() => 'answered'), setImmediate().then(() => 'unanswered')]);

  expect(first).toBe('unanswered');
});

test('it signals once the Backlog query is asked, and not for the Ready query', async () => {
  const held = buildHeldLinearCall();

  void held.call('query', { state: 'Ready', after: null });
  const beforeBacklog = await Promise.race([held.backlogAsked.then(() => 'asked'), setImmediate().then(() => 'not asked')]);
  void held.call('query', { state: 'Backlog' });
  const afterBacklog = await Promise.race([held.backlogAsked.then(() => 'asked'), setImmediate().then(() => 'not asked')]);

  expect([beforeBacklog, afterBacklog]).toStrictEqual(['not asked', 'asked']);
});

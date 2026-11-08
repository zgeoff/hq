import { expect, test } from 'bun:test';
import { collectOrphanEvents } from './collect-orphan-events.ts';

test('it logs a forgotten session as destroyed when its imp went', () => {
  const tree = { root: { session: { id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, issue: 'GEO-601', place: 'imp' }, destroyImp: true } as const;

  const events = collectOrphanEvents(tree, { forgotten: ['0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], destroyed: ['0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], kept: [], failed: [] });

  expect(events).toStrictEqual([
    {
      sessionID: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      action: 'session-forgotten',
      data: { name: 'kettle-agent', issue: 'GEO-601', reason: 'exited, with its work pushed and no open run needing it', destroyed: true },
      line: 'orphan session 0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa (kettle-agent) forgotten',
    },
  ]);
});

test('it logs a session whose forget failed as kept', () => {
  const tree = { root: { session: { id: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: false, state: 'exited', parent: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, issue: null, place: 'local' }, destroyImp: false } as const;

  const events = collectOrphanEvents(tree, { forgotten: [], destroyed: [], kept: [], failed: [{ id: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'atc did not forget the session' }] });

  expect(events).toStrictEqual([
    {
      sessionID: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      action: 'session-kept',
      data: { reason: 'forget failed: atc did not forget the session', issue: null },
      line: 'orphan session 0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa (kettle-helper) kept: forget failed: atc did not forget the session',
    },
  ]);
});

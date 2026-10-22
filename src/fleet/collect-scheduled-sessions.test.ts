import { expect, test } from 'bun:test';
import { collectScheduledSessions } from './collect-scheduled-sessions.ts';
import type { FleetEntry } from './types.ts';

function setupTest() {
  const fleet: FleetEntry[] = [
    { name: 'z-delivery', cwd: '/work', model: 'opus', prompt: 'main:skills/kettle/references/session-prompt.md', wake: false, roles: ['orchestrator'] },
    { name: 'z-ship', cwd: '/work', model: 'opus', prompt: 'main:skills/kettle/references/session-prompt.md', wake: false, roles: ['developer', 'release'] },
    { name: 'z-dev', cwd: '/work', model: 'opus', prompt: 'main:skills/kettle/references/session-prompt.md', wake: false, roles: ['developer'] },
    { name: 'z-kettle', cwd: '/work', model: 'opus', prompt: 'main:skills/kettle/references/session-prompt.md', wake: false },
  ];
  return {
    fleet,
    sessions: {
      'z-delivery': { id: 'id-delivery', name: 'z-delivery', alive: true },
      'z-ship': { id: 'id-ship', name: 'z-ship', alive: true },
      'z-dev': { id: 'id-dev', name: 'z-dev', alive: true },
      'z-kettle': { id: 'id-kettle', name: 'z-kettle', alive: true },
    },
  };
}

test('it collects the live sessions of the orchestrator and release roles only', () => {
  const ctx = setupTest();

  expect(collectScheduledSessions(ctx.fleet, ctx.sessions)).toStrictEqual({
    'z-delivery': { id: 'id-delivery', name: 'z-delivery', alive: true },
    'z-ship': { id: 'id-ship', name: 'z-ship', alive: true },
  });
});

test('it leaves out a scheduled entry with no live session', () => {
  const ctx = setupTest();

  expect(collectScheduledSessions(ctx.fleet, {})).toStrictEqual({});
});

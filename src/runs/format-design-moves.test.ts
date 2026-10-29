import { expect, test } from 'bun:test';
import { formatDesignMoves } from './format-design-moves.ts';

test('it prints a line per move with its design lane, time and the sessions that held the pass', () => {
  const lines = formatDesignMoves([{ at: '2026-10-15T20:00:00Z', designLane: 'agent', designSessions: ['a0000011-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000013-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] }]);

  expect(lines).toStrictEqual(['  design pass (agent) became the build run 2026-10-15T20:00:00Z; its sessions: a0000011-aaaa-4aaa-8aaa-aaaaaaaaaaaa, a0000013-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
});

test('it names no session for a pass that held none', () => {
  const lines = formatDesignMoves([{ at: '2026-10-15T20:00:00Z', designLane: 'with-geoff', designSessions: [] }]);

  expect(lines).toStrictEqual(['  design pass (with-geoff) became the build run 2026-10-15T20:00:00Z; its sessions: none']);
});

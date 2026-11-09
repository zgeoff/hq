import { expect, test } from 'bun:test';
import { buildMockRefusal } from './build-mock-refusal.ts';

test('it builds a default refusal with no tool and no reason', () => {
  expect(buildMockRefusal()).toStrictEqual({
    uuid: 'u1',
    at: '2026-10-14T03:00:00Z',
    claude_session: null,
    transcript: '/t.jsonl',
    subagent: 0,
    cwd: null,
    atc_session: null,
    atc_name: null,
    tool: null,
    input: null,
    reason: null,
    scanned_at: '2026-10-14T04:00:00Z',
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockRefusal({ uuid: 'u2', reason: 'the kettle was cold' })).toStrictEqual({
    uuid: 'u2',
    at: '2026-10-14T03:00:00Z',
    claude_session: null,
    transcript: '/t.jsonl',
    subagent: 0,
    cwd: null,
    atc_session: null,
    atc_name: null,
    tool: null,
    input: null,
    reason: 'the kettle was cold',
    scanned_at: '2026-10-14T04:00:00Z',
  });
});

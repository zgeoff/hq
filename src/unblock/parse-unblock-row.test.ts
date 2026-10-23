import { expect, test } from 'bun:test';
import { parseUnblockRow } from './parse-unblock-row.ts';

test.each([
  ['a condition of an unknown kind', '[{"kind":"wiki","ref":"KET-7"}]'],
  ['a condition with no ref', '[{"kind":"issue"}]'],
  ['an object', '{"kind":"issue","ref":"KET-7"}'],
  ['text that is not JSON', 'issue:KET-7'],
])('it reads %s stored as done_when as no conditions', (_label, column) => {
  const row = {
    id: 'steam-test',
    task: 'Run the steam test',
    minutes: null,
    unblocks: '[]',
    rank: null,
    notify: '[]',
    added_by: 'kettle-triage',
    state: 'open' as const,
    added_seq: 1,
    added_at: '2026-10-14T01:00:00Z',
    closed_at: null,
    note: null,
    updated_at: '2026-10-14T01:00:00Z',
    title: null,
    item: null,
    due_at: null,
    done_when: column,
    kind: 'owner' as const,
    deadline: null,
    overdue_told_at: null,
  };

  expect(parseUnblockRow(row).done_when).toStrictEqual([]);
});

test('it reads stored release and date conditions', () => {
  const row = {
    id: 'kettle-release',
    task: 'Check the kettle release',
    minutes: null,
    unblocks: '[]',
    rank: null,
    notify: '[]',
    added_by: 'kettle-qa',
    state: 'open' as const,
    added_seq: 1,
    added_at: '2026-10-14T01:00:00Z',
    closed_at: null,
    note: null,
    updated_at: '2026-10-14T01:00:00Z',
    title: null,
    item: null,
    due_at: null,
    done_when: '[{"kind":"release","ref":"kettle-co/kettle"},{"kind":"date","ref":"2026-10-20T00:00:00Z"}]',
    kind: 'watch' as const,
    deadline: null,
    overdue_told_at: null,
  };

  expect(parseUnblockRow(row).done_when).toStrictEqual([
    { kind: 'release', ref: 'kettle-co/kettle' },
    { kind: 'date', ref: '2026-10-20T00:00:00Z' },
  ]);
});

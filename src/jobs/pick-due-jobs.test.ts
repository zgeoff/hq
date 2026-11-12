import { expect, test } from 'bun:test';
import { pickDueJobs } from './pick-due-jobs.ts';
import type { SessionJob } from './types.ts';

test.each([
  {
    title: 'an every job once for its oldest slot after downtime, next at the slot after now',
    jobs: [{ id: 1, target: 'z-release', kind: 'every', spec: '2h', prompt: 'check the release queue', added_by: 'z-release', added_at: '2026-11-10T00:00:00Z', next_at: '2026-11-10T02:00:00Z', removed_at: null }] satisfies SessionJob[],
    at: '2026-11-10T09:10:00Z',
    expected: [{ id: 1, slot: '2026-11-10T02:00:00Z', nextAt: '2026-11-10T10:00:00Z' }],
  },
  {
    title: 'a daily job once after two days down, next at tomorrow',
    jobs: [{ id: 1, target: 'z-delivery', kind: 'daily', spec: '09:30Z', prompt: 'run the nightly batch', added_by: 'stu', added_at: '2026-11-08T00:00:00Z', next_at: '2026-11-08T09:30:00Z', removed_at: null }] satisfies SessionJob[],
    at: '2026-11-10T12:00:00Z',
    expected: [{ id: 1, slot: '2026-11-08T09:30:00Z', nextAt: '2026-11-11T09:30:00Z' }],
  },
  {
    title: 'an at job after downtime with no next slot',
    jobs: [{ id: 1, target: 'z-release', kind: 'at', spec: '2026-11-10T03:00:00Z', prompt: 'read the deploy result', added_by: 'z-release', added_at: '2026-11-10T00:00:00Z', next_at: '2026-11-10T03:00:00Z', removed_at: null }] satisfies SessionJob[],
    at: '2026-11-10T09:00:00Z',
    expected: [{ id: 1, slot: '2026-11-10T03:00:00Z', nextAt: null }],
  },
  {
    title: 'no job before its next slot',
    jobs: [{ id: 1, target: 'z-release', kind: 'every', spec: '2h', prompt: 'check the release queue', added_by: 'z-release', added_at: '2026-11-10T00:00:00Z', next_at: '2026-11-10T02:00:00Z', removed_at: null }] satisfies SessionJob[],
    at: '2026-11-10T01:55:00Z',
    expected: [],
  },
  {
    title: 'every job due at once, each with its own slot',
    jobs: [
      { id: 1, target: 'z-release', kind: 'every', spec: '2h', prompt: 'check the release queue', added_by: 'z-release', added_at: '2026-11-10T00:00:00Z', next_at: '2026-11-10T02:00:00Z', removed_at: null },
      { id: 2, target: 'z-delivery', kind: 'daily', spec: '09:30Z', prompt: 'run the nightly batch', added_by: 'stu', added_at: '2026-11-09T00:00:00Z', next_at: '2026-11-10T09:30:00Z', removed_at: null },
      { id: 3, target: 'z-triage', kind: 'at', spec: '2026-11-10T11:00:00Z', prompt: 'sort the inbox', added_by: 'z-triage', added_at: '2026-11-10T00:00:00Z', next_at: '2026-11-10T11:00:00Z', removed_at: null },
    ] satisfies SessionJob[],
    at: '2026-11-10T10:00:00Z',
    expected: [
      { id: 1, slot: '2026-11-10T02:00:00Z', nextAt: '2026-11-10T12:00:00Z' },
      { id: 2, slot: '2026-11-10T09:30:00Z', nextAt: '2026-11-11T09:30:00Z' },
    ],
  },
  {
    title: 'no removed job, even past its next slot',
    jobs: [{ id: 1, target: 'z-release', kind: 'every', spec: '2h', prompt: 'check the release queue', added_by: 'z-release', added_at: '2026-11-10T00:00:00Z', next_at: '2026-11-10T02:00:00Z', removed_at: '2026-11-10T01:00:00Z' }] satisfies SessionJob[],
    at: '2026-11-10T09:00:00Z',
    expected: [],
  },
])('it picks $title', (row) => {
  const picked = pickDueJobs(row.jobs, new Date(row.at));

  expect({ due: picked.due.map((due) => ({ id: due.job.id, slot: due.slot, nextAt: due.nextAt })), broken: picked.broken }).toStrictEqual({ due: [...row.expected], broken: [] });
});

test('it returns a due job whose stored schedule no longer parses as broken, and still picks the others', () => {
  const broken: SessionJob = { id: 1, target: 'z-triage', kind: 'every', spec: 'soon', prompt: 'sort the inbox', added_by: 'z-triage', added_at: '2026-11-10T00:00:00Z', next_at: '2026-11-10T02:00:00Z', removed_at: null };
  const good: SessionJob = { id: 2, target: 'z-release', kind: 'every', spec: '2h', prompt: 'check the release queue', added_by: 'z-release', added_at: '2026-11-10T00:00:00Z', next_at: '2026-11-10T02:00:00Z', removed_at: null };

  expect(pickDueJobs([broken, good], new Date('2026-11-10T02:03:00Z'))).toStrictEqual({
    due: [{ job: good, slot: '2026-11-10T02:00:00Z', nextAt: '2026-11-10T04:00:00Z' }],
    broken: [{ job: broken, reason: expect.stringContaining('--every soon') }],
  });
});

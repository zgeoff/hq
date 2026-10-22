import { expect, test } from 'bun:test';
import { parseLinearIssuesFlags } from './parse-linear-issues-flags.ts';

test('it reads the team, the trimmed states, the folder, the fields and the time as UTC', () => {
  expect(parseLinearIssuesFlags({ team: 'KET', state: 'Ready, In Review', out: '/tmp/kettle', fields: 'id,title', 'updated-since': '2026-10-01T10:00:00+11:00' })).toStrictEqual({ team: 'KET', states: ['Ready', 'In Review'], out: '/tmp/kettle', fields: ['id', 'title'], updatedSince: '2026-09-30T23:00:00.000Z' });
});

test('it leaves the time unset when no --updated-since is given', () => {
  expect(parseLinearIssuesFlags({ team: 'KET', state: 'Ready', out: '/tmp/kettle' }).updatedSince).toBeUndefined();
});

test.each([
  ['an empty state', { team: 'KET', state: 'Ready,,Done', out: '/tmp/kettle' }, '--state is a comma-separated list of state names, with none empty'],
  ['a time with no offset', { team: 'KET', state: 'Ready', out: '/tmp/kettle', 'updated-since': '2026-10-01T10:00:00' }, '--updated-since must be an ISO date-time with an offset or Z, or a date YYYY-MM-DD, not "2026-10-01T10:00:00"'],
])('it refuses %s as bad_args', (_case, flags, message) => {
  expect(() => parseLinearIssuesFlags(flags)).toThrow(expect.objectContaining({ code: 'bad_args', message }));
});

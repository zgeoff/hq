import { expect, test } from 'bun:test';
import { parseJobAdd } from './parse-job-add.ts';

test.each([
  { title: 'no role', target: undefined, flags: { every: '2h', prompt: 'check the queue' }, reason: 'hq jobs add needs a role, like z-release' },
  { title: 'a blank role', target: '  ', flags: { every: '2h', prompt: 'check the queue' }, reason: 'hq jobs add needs a role, like z-release' },
  { title: 'an unknown role', target: 'z-nobody', flags: { every: '2h', prompt: 'check the queue' }, reason: 'z-nobody is no declared fleet session' },
  { title: 'no prompt', target: 'z-release', flags: { every: '2h' }, reason: '--prompt is required' },
  { title: 'a blank prompt', target: 'z-release', flags: { every: '2h', prompt: ' ' }, reason: '--prompt is required' },
  { title: 'no schedule', target: 'z-release', flags: { prompt: 'check the queue' }, reason: 'give exactly one of --every <30m|2h|1d>, --daily <HH:MMZ> or --at <ISO time>' },
  { title: 'two schedules', target: 'z-release', flags: { every: '2h', daily: '09:30Z', prompt: 'check the queue' }, reason: 'give exactly one of --every <30m|2h|1d>, --daily <HH:MMZ> or --at <ISO time>' },
  { title: 'a past one-shot time', target: 'z-release', flags: { at: '2026-11-09T00:00:00Z', prompt: 'check the queue' }, reason: '--at 2026-11-09T00:00:00Z is already past' },
])('it refuses an add with $title', (row) => {
  expect(parseJobAdd({ target: row.target, flags: row.flags, declared: ['z-release', 'z-triage'], at: new Date('2026-11-10T00:00:00Z') })).toStrictEqual({ ok: false, reason: row.reason });
});

test.each([
  { title: 'a bad every', flags: { every: 'soon', prompt: 'check the queue' }, reason: /--every soon/u },
  { title: 'an every too large for a date', flags: { every: '99999999999d', prompt: 'check the queue' }, reason: /over 366d/u },
  { title: 'an at on February 30', flags: { at: '2027-02-30T09:00:00Z', prompt: 'check the queue' }, reason: /not an ISO time/u },
])('it refuses an add with $title as the schedule parser words it', (row) => {
  expect(parseJobAdd({ target: 'z-release', flags: row.flags, declared: ['z-release'], at: new Date('2026-11-10T00:00:00Z') })).toStrictEqual({ ok: false, reason: expect.stringMatching(row.reason) });
});

test.each([
  { title: 'an every', flags: { every: '2h', prompt: 'check the queue' }, value: { kind: 'every', spec: '2h' }, nextAt: '2026-11-10T02:00:00.000Z' },
  { title: 'a daily', flags: { daily: '09:30Z', prompt: 'check the queue' }, value: { kind: 'daily', spec: '09:30Z' }, nextAt: '2026-11-10T09:30:00.000Z' },
  { title: 'a future at', flags: { at: '2026-11-10T05:00:00Z', prompt: 'check the queue' }, value: { kind: 'at', spec: '2026-11-10T05:00:00Z' }, nextAt: '2026-11-10T05:00:00.000Z' },
])('it returns the job to write for $title', (row) => {
  expect(parseJobAdd({ target: 'z-release', flags: row.flags, declared: ['z-release'], at: new Date('2026-11-10T00:00:00Z') })).toStrictEqual({
    ok: true,
    job: { target: 'z-release', value: row.value, prompt: 'check the queue', nextAt: new Date(row.nextAt) },
  });
});

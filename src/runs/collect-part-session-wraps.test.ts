import { expect, test } from 'bun:test';
import { collectPartSessionWraps } from './collect-part-session-wraps.ts';

test.each([
  { title: 'all owned PRs merged', prs: [['merged', '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], ['merged', '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa']], session: {}, activity: 'idle', wrapped: false, picked: true },
  { title: 'owned PRs merged and closed', prs: [['merged', '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], ['closed', '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa']], session: {}, activity: 'idle', wrapped: false, picked: true },
  { title: 'an owner stored as a prefix', prs: [['merged', '0000c001']], session: {}, activity: 'idle', wrapped: false, picked: true },
  { title: 'an unowned open PR on the run', prs: [['merged', '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], ['open', null]], session: {}, activity: 'idle', wrapped: false, picked: true },
  { title: 'an open PR of another session', prs: [['merged', '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], ['open', '0000c002-aaaa-4aaa-8aaa-aaaaaaaaaaaa']], session: {}, activity: 'idle', wrapped: false, picked: true },
  { title: 'a blocked run', prs: [['merged', '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa']], session: { runState: 'blocked' }, activity: 'idle', wrapped: false, picked: true },
  { title: 'one owned PR still open', prs: [['merged', '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], ['open', '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa']], session: {}, activity: 'idle', wrapped: false, picked: false },
  { title: 'no owned PR', prs: [['merged', null]], session: {}, activity: 'idle', wrapped: false, picked: false },
  { title: 'every owned PR closed and none merged', prs: [['closed', '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa']], session: {}, activity: 'idle', wrapped: false, picked: false },
  { title: 'a main session', prs: [['merged', '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa']], session: { helper: 0 }, activity: 'idle', wrapped: false, picked: false },
  { title: 'an ended session', prs: [['merged', '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa']], session: { active: 0 }, activity: 'idle', wrapped: false, picked: false },
  { title: 'a design pass session', prs: [['merged', '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa']], session: { design_pass: 1 }, activity: 'idle', wrapped: false, picked: false },
  { title: 'a merged run', prs: [['merged', '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa']], session: { runState: 'merged' }, activity: 'idle', wrapped: false, picked: false },
  { title: 'a running session', prs: [['merged', '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa']], session: {}, activity: 'running', wrapped: false, picked: false },
  { title: 'recent activity', prs: [['merged', '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa']], session: {}, activity: 'recent', wrapped: false, picked: false },
  { title: 'unknown activity', prs: [['merged', '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa']], session: {}, activity: 'unknown', wrapped: false, picked: false },
  { title: 'a session atc does not list', prs: [['merged', '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa']], session: {}, activity: 'unlisted', wrapped: false, picked: false },
  { title: 'a session already wrapped', prs: [['merged', '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa']], session: {}, activity: 'idle', wrapped: true, picked: false },
])('it picks the session for $title: $picked', (row) => {
  const nowMs = Date.parse('2026-11-07T12:00:00Z');
  const activity = new Map([
    ['idle', { atcState: 'needs_you', lastActivityAt: nowMs - 45 * 60_000 }],
    ['running', { atcState: 'running', lastActivityAt: nowMs - 45 * 60_000 }],
    ['recent', { atcState: 'needs_you', lastActivityAt: nowMs - 5 * 60_000 }],
    ['unknown', { atcState: 'needs_you', lastActivityAt: null }],
    ['unlisted', { atcState: null, lastActivityAt: nowMs - 45 * 60_000 }],
  ]).get(row.activity);

  const known = activity === undefined ? [] : [['0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', activity] as const];
  const wrapped = row.wrapped ? ['0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] : [];
  const expected = row.picked ? [{ issue: 'GEO-501', session_id: '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }] : [];

  const wraps = collectPartSessionWraps({
    sessions: [
      {
        issue: 'GEO-501',
        session_id: '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        helper: 1,
        active: 1,
        design_pass: 0,
        runState: 'working',
        ...row.session,
      },
    ],
    prs: row.prs.map(([state, owner]) => ({ issue: 'GEO-501', state, session_id: owner })),
    activity: new Map(known),
    wrapped: new Set(wrapped),
    nowMs,
    quietMs: 30 * 60_000,
  });

  expect(wraps).toStrictEqual(expected);
});

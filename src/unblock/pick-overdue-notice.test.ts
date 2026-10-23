import { expect, test } from 'bun:test';
import { pickOverdueNotice } from './pick-overdue-notice.ts';

test('it tells the adder, the notify sessions and the owner session once each, after the deadline', () => {
  const notice = pickOverdueNotice(
    { id: 'kettle-release', task: 'Live-check the kettle release', state: 'open', deadline: '2026-10-14T00:30:00Z', overdue_told_at: null, done_when: [{ kind: 'release', ref: 'kettle-co/kettle' }], added_by: 'kettle-triage', notify: ['kettle-qa', 'kettle-owner'] },
    { actor: 'kettle-bot', at: new Date('2026-10-14T01:00:00Z'), ownerSession: 'kettle-owner' },
  );

  expect(notice).toStrictEqual({
    deadline: '2026-10-14T00:30:00Z',
    sessions: ['kettle-triage', 'kettle-qa', 'kettle-owner'],
    text: '"Live-check the kettle release" (unblock kettle-release) is overdue: its deadline 2026-10-14T00:30:00Z passed and release:kettle-co/kettle has not happened.',
  });
});

test('it tells the item overdue at the deadline itself', () => {
  const notice = pickOverdueNotice(
    { id: 'kettle-descale', task: 'Descale the kettle', state: 'open', deadline: '2026-10-14T01:00:00Z', overdue_told_at: null, done_when: [], added_by: 'kettle-triage', notify: [] },
    { actor: 'kettle-bot', at: new Date('2026-10-14T01:00:00Z'), ownerSession: 'kettle-owner' },
  );

  expect(notice).toStrictEqual({
    deadline: '2026-10-14T01:00:00Z',
    sessions: ['kettle-triage', 'kettle-owner'],
    text: '"Descale the kettle" (unblock kettle-descale) is overdue: its deadline 2026-10-14T01:00:00Z passed.',
  });
});

test('it leaves out the actor that runs the check', () => {
  const notice = pickOverdueNotice(
    { id: 'kettle-descale', task: 'Descale the kettle', state: 'open', deadline: '2026-10-14T00:30:00Z', overdue_told_at: null, done_when: [], added_by: 'kettle-bot', notify: ['kettle-qa'] },
    { actor: 'kettle-bot', at: new Date('2026-10-14T01:00:00Z'), ownerSession: 'kettle-owner' },
  );

  expect(notice?.sessions).toStrictEqual(['kettle-qa', 'kettle-owner']);
});

test('it gives no notice before the deadline', () => {
  const notice = pickOverdueNotice(
    { id: 'kettle-descale', task: 'Descale the kettle', state: 'open', deadline: '2026-10-14T02:00:00Z', overdue_told_at: null, done_when: [], added_by: 'kettle-triage', notify: [] },
    { actor: 'kettle-bot', at: new Date('2026-10-14T01:00:00Z'), ownerSession: 'kettle-owner' },
  );

  expect(notice).toBeNull();
});

test('it gives no notice for an item with no deadline', () => {
  const notice = pickOverdueNotice(
    { id: 'kettle-descale', task: 'Descale the kettle', state: 'open', deadline: null, overdue_told_at: null, done_when: [], added_by: 'kettle-triage', notify: [] },
    { actor: 'kettle-bot', at: new Date('2026-10-14T01:00:00Z'), ownerSession: 'kettle-owner' },
  );

  expect(notice).toBeNull();
});

test('it gives no notice for an item already told', () => {
  const notice = pickOverdueNotice(
    { id: 'kettle-descale', task: 'Descale the kettle', state: 'open', deadline: '2026-10-14T00:30:00Z', overdue_told_at: '2026-10-14T00:40:00Z', done_when: [], added_by: 'kettle-triage', notify: [] },
    { actor: 'kettle-bot', at: new Date('2026-10-14T01:00:00Z'), ownerSession: 'kettle-owner' },
  );

  expect(notice).toBeNull();
});

test.each([['done' as const], ['dropped' as const]])('it gives no notice for a %s item', (state) => {
  const notice = pickOverdueNotice(
    { id: 'kettle-descale', task: 'Descale the kettle', state, deadline: '2026-10-14T00:30:00Z', overdue_told_at: null, done_when: [], added_by: 'kettle-triage', notify: [] },
    { actor: 'kettle-bot', at: new Date('2026-10-14T01:00:00Z'), ownerSession: 'kettle-owner' },
  );

  expect(notice).toBeNull();
});

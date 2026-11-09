import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../test/helpers.ts';
import { addRun } from './add-run.ts';
import { finalPr } from './final-pr.ts';
import { findAlerts } from './find-alerts.ts';
import { recordCICheckOverride } from '../pr-status/record-ci-check-override.ts';
import { recordPROverride } from '../pr-status/record-pr-override.ts';
import { reviewStarted } from './review-started.ts';
import { reviewedPr } from './reviewed-pr.ts';
import { scheduleFinalReview } from './schedule-final-review.ts';
import { setReviewWait } from './set-review-wait.ts';
import { setSession } from './set-session.ts';
import { buildSeeder } from '../test-utils/build-seeder.ts';
import { setState } from './set-state.ts';
import { unfinalPr } from './unfinal-pr.ts';
import { updateGoneRunSessions } from './update-gone-run-sessions.ts';
import { addUnblock } from '../unblock/add-unblock.ts';
import { closeUnblock } from '../unblock/close-unblock.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, seed: buildSeeder(fresh) };
}

test('it raises no FINAL alert for a PR whose review started after the FINAL and passed at a newer head', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9821', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  at('2026-10-21T01:00:00Z');
  ctx.seed.finalRunPR({ issue: 'GEO-9821', ref: 'kettle#21' });
  at('2026-10-21T01:40:00Z');
  reviewStarted(ctx.db, 'kettle#21', 'kettle-review');
  at('2026-10-21T01:55:00Z');
  reviewedPr(ctx.db, 'kettle#21', 'def5678', { recheck: false, force: false }, 'kettle-review');

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([]);
});

test('it raises a FINAL alert for a PR with no review after its FINAL', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9822', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  at('2026-10-21T01:00:00Z');
  ctx.seed.finalRunPR({ issue: 'GEO-9822', ref: 'kettle#22' });

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([
    { key: 'pr:kettle#22', fingerprint: 'final:abc1234', issue: 'GEO-9822', line: 'kettle#22 (GEO-9822) final at abc1234 for 120 min, no review [from marker:kettle]' },
  ]);
});

test('it raises a FINAL alert for a PR whose only review came before its FINAL, at another head', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9823', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  at('2026-10-21T00:30:00Z');
  ctx.seed.runPR({ issue: 'GEO-9823', ref: 'kettle#23' });
  reviewStarted(ctx.db, 'kettle#23', 'kettle-review');
  at('2026-10-21T00:45:00Z');
  reviewedPr(ctx.db, 'kettle#23', 'def5678', { recheck: false, force: false }, 'kettle-review');
  at('2026-10-21T01:00:00Z');
  scheduleFinalReview(ctx.db, { ref: 'kettle#23', sha: 'abc1234', source: 'marker:kettle', actor: 'kettle-bot', note: null });

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([
    { key: 'pr:kettle#23', fingerprint: 'final:abc1234', issue: 'GEO-9823', line: 'kettle#23 (GEO-9823) final at abc1234 for 120 min, no review; head moved since your review at def5678 (a restack? a passed hq review kettle 23 records the new head) [from marker:kettle]' },
  ]);
});

test('it raises no FINAL alert for a PR with an owner override at its FINAL head', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9826', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  at('2026-10-21T00:45:00Z');
  ctx.seed.runPR({ issue: 'GEO-9826', ref: 'kettle#26' });
  reviewedPr(ctx.db, 'kettle#26', 'def5678', { recheck: false, force: false }, 'kettle-review');
  reviewedPr(ctx.db, 'kettle#26', 'def5678', { recheck: true, force: false }, 'kettle-review');
  at('2026-10-21T01:00:00Z');
  scheduleFinalReview(ctx.db, { ref: 'kettle#26', sha: 'abc1234', source: 'marker:kettle', actor: 'kettle-bot', note: null });
  recordPROverride(ctx.db, { repo: 'kettle', pr: 26, head: 'abc1234aaaabbbbccccddddeeeeffff00001111', source: 'chat:kettle-chat@2026-10-21T01:30:00Z', note: 'Invented: the restack kept each fix.', actor: 'kettle-bot' });

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([]);
});

test('it raises a FINAL alert for a PR whose owner override is at an older head', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9827', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  at('2026-10-21T01:00:00Z');
  ctx.seed.finalRunPR({ issue: 'GEO-9827', ref: 'kettle#27' });
  recordPROverride(ctx.db, { repo: 'kettle', pr: 27, head: 'fed9876', source: 'chat:kettle-chat@2026-10-21T00:30:00Z', note: 'Invented: an older head.', actor: 'kettle-bot' });

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([
    { key: 'pr:kettle#27', fingerprint: 'final:abc1234', issue: 'GEO-9827', line: 'kettle#27 (GEO-9827) final at abc1234 for 120 min, no review [from marker:kettle]' },
  ]);
});

test('it raises no exited alert for a session whose PR passed a review round that started after its FINAL, at a newer head', () => {
  const ctx = setupTest();
  const session = '11111111-2222-4333-8444-555555555555';
  addRun(ctx.db, { issue: 'GEO-9824', title: 'Invented kettle work', place: 'imp', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  at('2026-10-21T01:00:00Z');
  ctx.seed.finalRunPR({ issue: 'GEO-9824', ref: 'kettle#24' });
  at('2026-10-21T01:40:00Z');
  reviewStarted(ctx.db, 'kettle#24', 'kettle-review');
  at('2026-10-21T01:55:00Z');
  reviewedPr(ctx.db, 'kettle#24', 'def5678', { recheck: false, force: false }, 'kettle-review');

  expect(findAlerts(ctx.db, [{ id: session, name: 'kettle', alive: false, state: 'exited' }], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([]);
});

test('it raises an exited alert for a session whose PR was reviewed only before its FINAL', () => {
  const ctx = setupTest();
  const session = '66666666-7777-4888-8999-aaaaaaaaaaaa';
  addRun(ctx.db, { issue: 'GEO-9825', title: 'Invented kettle work', place: 'imp', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  at('2026-10-21T00:30:00Z');
  ctx.seed.runPR({ issue: 'GEO-9825', ref: 'kettle#25' });
  reviewStarted(ctx.db, 'kettle#25', 'kettle-review');
  at('2026-10-21T00:45:00Z');
  reviewedPr(ctx.db, 'kettle#25', 'def5678', { recheck: false, force: false }, 'kettle-review');
  at('2026-10-21T01:00:00Z');
  scheduleFinalReview(ctx.db, { ref: 'kettle#25', sha: 'abc1234', source: 'marker:kettle', actor: 'kettle-bot', note: null });

  const lines = findAlerts(ctx.db, [{ id: session, name: 'kettle', alive: false, state: 'exited' }], new Map(), new Date('2026-10-21T03:00:00Z')).map((alert) => alert.line);

  expect(lines).toContain('GEO-9825: session 66666666 has exited; check for its PR or final note');
});

test('it raises no exited alert for a session whose PR has an owner override at its FINAL head', () => {
  const ctx = setupTest();
  const session = '77777777-8888-4999-8aaa-bbbbbbbbbbbb';
  addRun(ctx.db, { issue: 'GEO-9828', title: 'Invented kettle work', place: 'imp', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  at('2026-10-21T00:45:00Z');
  ctx.seed.runPR({ issue: 'GEO-9828', ref: 'kettle#28' });
  reviewedPr(ctx.db, 'kettle#28', 'def5678', { recheck: false, force: false }, 'kettle-review');
  reviewedPr(ctx.db, 'kettle#28', 'def5678', { recheck: true, force: false }, 'kettle-review');
  at('2026-10-21T01:00:00Z');
  scheduleFinalReview(ctx.db, { ref: 'kettle#28', sha: 'abc1234', source: 'marker:kettle', actor: 'kettle-bot', note: null });
  recordPROverride(ctx.db, { repo: 'kettle', pr: 28, head: 'abc1234aaaabbbbccccddddeeeeffff00001111', source: 'chat:kettle-chat@2026-10-21T01:30:00Z', note: 'Invented: the restack kept each fix.', actor: 'kettle-bot' });

  expect(findAlerts(ctx.db, [{ id: session, name: 'kettle', alive: false, state: 'exited' }], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([]);
});

test('it raises no FINAL alert while the run waits on an open unblock item', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9831', title: 'Invented kettle stack', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addUnblock(ctx.db, { id: 'u901', task: 'Approve the kettle base layer', minutes: null, unblocks: [], notify: [], actor: 'kettle-review' });
  setState(ctx.db, 'GEO-9831', 'working', { next: 'Agent working.', waitsOn: 'kettle#30 base, waits on u901' }, 'kettle-bot');
  at('2026-10-21T01:00:00Z');
  ctx.seed.finalRunPR({ issue: 'GEO-9831', ref: 'kettle#31' });

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([]);
});

test('it raises the FINAL alert again once the unblock item the run waits on closes', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9832', title: 'Invented kettle stack', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addUnblock(ctx.db, { id: 'u902', task: 'Approve the kettle base layer', minutes: null, unblocks: [], notify: [], actor: 'kettle-review' });
  closeUnblock(ctx.db, 'u902', 'done', null, 'kettle-review');
  setState(ctx.db, 'GEO-9832', 'working', { next: 'Agent working.', waitsOn: 'waits on u902' }, 'kettle-bot');
  at('2026-10-21T01:00:00Z');
  ctx.seed.finalRunPR({ issue: 'GEO-9832', ref: 'kettle#32' });

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([
    { key: 'pr:kettle#32', fingerprint: 'final:abc1234', issue: 'GEO-9832', line: 'kettle#32 (GEO-9832) final at abc1234 for 120 min, no review [from marker:kettle]' },
  ]);
});

test('it raises the FINAL alert for a run whose wait names no open unblock item', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9833', title: 'Invented kettle stack', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addUnblock(ctx.db, { id: 'u903', task: 'Approve the kettle base layer', minutes: null, unblocks: [], notify: [], actor: 'kettle-review' });
  setState(ctx.db, 'GEO-9833', 'working', { next: 'Agent working.', waitsOn: 'waits on u9030 and the kettle release' }, 'kettle-bot');
  at('2026-10-21T01:00:00Z');
  ctx.seed.finalRunPR({ issue: 'GEO-9833', ref: 'kettle#33' });

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([
    { key: 'pr:kettle#33', fingerprint: 'final:abc1234', issue: 'GEO-9833', line: 'kettle#33 (GEO-9833) final at abc1234 for 120 min, no review [from marker:kettle]' },
  ]);
});

test('it raises no exited or quiet alert for a helper asleep in its suspended imp, three hours after its last activity', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9841', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  setSession(ctx.db, 'GEO-9841', '98410000-0000-4000-8000-000000000001', 'kettle-bot', 'add');

  const asleep = { id: '98410000-0000-4000-8000-000000000001', name: 'kettle helper', alive: false, state: 'exited', lifecycle: { desired: 'run', vm: 'asleep', harness: 'suspended' } };

  const activity = new Map([['98410000-0000-4000-8000-000000000001', Date.parse('2026-10-21T00:00:00Z')]]);

  expect(findAlerts(ctx.db, [asleep], activity, new Date('2026-10-21T03:00:00Z'))).toStrictEqual([]);
});

test('it raises the exited alert for a helper atc lists as ended', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9842', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  setSession(ctx.db, 'GEO-9842', '98420000-0000-4000-8000-000000000001', 'kettle-bot', 'add');

  const ended = { id: '98420000-0000-4000-8000-000000000001', name: 'kettle helper', alive: false, state: 'exited', lifecycle: { desired: 'stop', vm: 'none', harness: 'exited' } };

  expect(findAlerts(ctx.db, [ended], new Map(), new Date('2026-10-21T03:00:00Z')).map((alert) => alert.line)).toStrictEqual(['GEO-9842: helper session 98420000 has exited; wrap it up, or hq run session GEO-9842 98420000 --remove']);
});

test('it raises no prompt-wait alert for a session waiting past the quiet limit whose open PR is final and reviewed at its head', () => {
  const ctx = setupTest();
  const session = '98510000-0000-4000-8000-000000000001';
  addRun(ctx.db, { issue: 'GEO-9851', title: 'Invented kettle work', place: 'imp', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  at('2026-10-21T01:00:00Z');
  ctx.seed.finalRunPR({ issue: 'GEO-9851', ref: 'kettle#51' });
  at('2026-10-21T01:10:00Z');
  reviewStarted(ctx.db, 'kettle#51', 'kettle-review');
  at('2026-10-21T01:20:00Z');
  reviewedPr(ctx.db, 'kettle#51', 'abc1234', { recheck: false, force: false }, 'kettle-review');

  const activity = new Map([[session, Date.parse('2026-10-21T01:30:00Z')]]);

  expect(findAlerts(ctx.db, [{ id: session, name: 'kettle', alive: true, state: 'needs_you' }], activity, new Date('2026-10-21T03:00:00Z'))).toStrictEqual([]);
});

test('it raises the prompt-wait alert for a session waiting past the quiet limit whose open PR is final but not reviewed', () => {
  const ctx = setupTest();
  const session = '98520000-0000-4000-8000-000000000001';
  addRun(ctx.db, { issue: 'GEO-9852', title: 'Invented kettle work', place: 'imp', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  at('2026-10-21T01:00:00Z');
  ctx.seed.finalRunPR({ issue: 'GEO-9852', ref: 'kettle#52' });

  const activity = new Map([[session, Date.parse('2026-10-21T01:30:00Z')]]);

  expect(findAlerts(ctx.db, [{ id: session, name: 'kettle', alive: true, state: 'needs_you' }], activity, new Date('2026-10-21T03:00:00Z'))).toStrictEqual([
    { key: 'pr:kettle#52', fingerprint: 'final:abc1234', issue: 'GEO-9852', line: 'kettle#52 (GEO-9852) final at abc1234 for 120 min, no review [from marker:kettle]' },
    { key: `session:${session}`, fingerprint: 'quiet:needs_you', issue: 'GEO-9852', line: 'GEO-9852: session 98520000 waits on a prompt for 90 min' },
  ]);
});

test('it raises the prompt-wait alert for a session waiting past the quiet limit on a run with no open PR', () => {
  const ctx = setupTest();
  const session = '98530000-0000-4000-8000-000000000001';
  addRun(ctx.db, { issue: 'GEO-9853', title: 'Invented kettle work', place: 'imp', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });

  const activity = new Map([[session, Date.parse('2026-10-21T01:30:00Z')]]);

  expect(findAlerts(ctx.db, [{ id: session, name: 'kettle', alive: true, state: 'needs_you' }], activity, new Date('2026-10-21T03:00:00Z'))).toStrictEqual([
    { key: `session:${session}`, fingerprint: 'quiet:needs_you', issue: 'GEO-9853', line: 'GEO-9853: session 98530000 waits on a prompt for 90 min' },
  ]);
});

test('it raises no prompt-wait alert for a helper that carries the run, with no main session active, once its run PR is final and reviewed at its head', () => {
  const ctx = setupTest();
  const helper = '98540000-0000-4000-8000-000000000001';
  addRun(ctx.db, { issue: 'GEO-9854', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  setSession(ctx.db, 'GEO-9854', helper, 'kettle-bot', 'add');
  at('2026-10-21T01:00:00Z');
  ctx.seed.finalRunPR({ issue: 'GEO-9854', ref: 'kettle#54' });
  at('2026-10-21T01:10:00Z');
  reviewStarted(ctx.db, 'kettle#54', 'kettle-review');
  at('2026-10-21T01:20:00Z');
  reviewedPr(ctx.db, 'kettle#54', 'abc1234', { recheck: false, force: false }, 'kettle-review');

  const activity = new Map([[helper, Date.parse('2026-10-21T01:30:00Z')]]);

  expect(findAlerts(ctx.db, [{ id: helper, name: 'kettle helper', alive: true, state: 'needs_you' }], activity, new Date('2026-10-21T03:00:00Z'))).toStrictEqual([]);
});

test('it raises the prompt-wait alert for a helper beside an active main session, although the run PR is final and reviewed at its head', () => {
  const ctx = setupTest();
  const main = '98570000-0000-4000-8000-000000000001';
  const helper = '98570000-0000-4000-8000-000000000002';
  addRun(ctx.db, { issue: 'GEO-9857', title: 'Invented kettle work', place: 'imp', session: main, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  setSession(ctx.db, 'GEO-9857', helper, 'kettle-bot', 'add');
  at('2026-10-21T01:00:00Z');
  ctx.seed.finalRunPR({ issue: 'GEO-9857', ref: 'kettle#57' });
  at('2026-10-21T01:10:00Z');
  reviewStarted(ctx.db, 'kettle#57', 'kettle-review');
  at('2026-10-21T01:20:00Z');
  reviewedPr(ctx.db, 'kettle#57', 'abc1234', { recheck: false, force: false }, 'kettle-review');
  const sessions = [
    { id: main, name: 'kettle', alive: true, state: 'running' },
    { id: helper, name: 'kettle helper', alive: true, state: 'needs_you' },
  ];

  const activity = new Map([
    [main, Date.parse('2026-10-21T02:55:00Z')],
    [helper, Date.parse('2026-10-21T01:30:00Z')],
  ]);

  expect(findAlerts(ctx.db, sessions, activity, new Date('2026-10-21T03:00:00Z'))).toStrictEqual([
    { key: `session:${helper}`, fingerprint: 'quiet:needs_you', issue: 'GEO-9857', line: 'GEO-9857: helper session 98570000 waits on a prompt for 90 min' },
  ]);
});

test('it raises no quiet alert for an idle session past the quiet limit whose open PR is final and reviewed at its head', () => {
  const ctx = setupTest();
  const session = '98550000-0000-4000-8000-000000000001';
  addRun(ctx.db, { issue: 'GEO-9855', title: 'Invented kettle work', place: 'imp', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  at('2026-10-21T01:00:00Z');
  ctx.seed.finalRunPR({ issue: 'GEO-9855', ref: 'kettle#55' });
  at('2026-10-21T01:10:00Z');
  reviewStarted(ctx.db, 'kettle#55', 'kettle-review');
  at('2026-10-21T01:20:00Z');
  reviewedPr(ctx.db, 'kettle#55', 'abc1234', { recheck: false, force: false }, 'kettle-review');

  const activity = new Map([[session, Date.parse('2026-10-21T01:30:00Z')]]);

  expect(findAlerts(ctx.db, [{ id: session, name: 'kettle', alive: true, state: 'idle' }], activity, new Date('2026-10-21T03:00:00Z'))).toStrictEqual([]);
});

test('it raises the quiet alert for an idle session past the quiet limit whose open PR is final but not reviewed', () => {
  const ctx = setupTest();
  const session = '98560000-0000-4000-8000-000000000001';
  addRun(ctx.db, { issue: 'GEO-9856', title: 'Invented kettle work', place: 'imp', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  at('2026-10-21T01:00:00Z');
  ctx.seed.finalRunPR({ issue: 'GEO-9856', ref: 'kettle#56' });

  const activity = new Map([[session, Date.parse('2026-10-21T01:30:00Z')]]);

  expect(findAlerts(ctx.db, [{ id: session, name: 'kettle', alive: true, state: 'idle' }], activity, new Date('2026-10-21T03:00:00Z'))).toStrictEqual([
    { key: 'pr:kettle#56', fingerprint: 'final:abc1234', issue: 'GEO-9856', line: 'kettle#56 (GEO-9856) final at abc1234 for 120 min, no review [from marker:kettle]' },
    { key: `session:${session}`, fingerprint: 'quiet:idle', issue: 'GEO-9856', line: 'GEO-9856: session 98560000 quiet for 90 min; if it waits only on the owner, hq run state GEO-9856 working --waits-on-geoff' },
  ]);
});

test('it raises no quiet alert for an idle session past the quiet limit on a run that waits on Geoff', () => {
  const ctx = setupTest();
  const session = '98570000-0000-4000-8000-000000000001';
  addRun(ctx.db, { issue: 'GEO-9857', title: 'Invented kettle work', place: 'imp', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  setState(ctx.db, 'GEO-9857', 'working', { next: 'Geoff picks a kettle colour.', waitsOnGeoff: true }, 'kettle-bot');

  const activity = new Map([[session, Date.parse('2026-10-21T01:30:00Z')]]);

  expect(findAlerts(ctx.db, [{ id: session, name: 'kettle', alive: true, state: 'idle' }], activity, new Date('2026-10-21T03:00:00Z'))).toStrictEqual([]);
});

test('it raises the exited alert for a session that ended on a run that waits on Geoff', () => {
  const ctx = setupTest();
  const session = '98580000-0000-4000-8000-000000000001';
  addRun(ctx.db, { issue: 'GEO-9858', title: 'Invented kettle work', place: 'imp', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  setState(ctx.db, 'GEO-9858', 'working', { next: 'Geoff picks a kettle colour.', waitsOnGeoff: true }, 'kettle-bot');

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z')).map((alert) => alert.line)).toStrictEqual(['GEO-9858: session 98580000 has exited; check for its PR or final note']);
});

test('it raises no prompt-wait alert for a session past the quiet limit on a run whose wait is named', () => {
  const ctx = setupTest();
  const session = '98590000-0000-4000-8000-000000000001';
  addRun(ctx.db, { issue: 'GEO-9859', title: 'Invented kettle work', place: 'imp', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  setState(ctx.db, 'GEO-9859', 'working', { next: 'The reviewer rules on kettle#59.', waitsOn: 'the reviewer (ruling on kettle#59)' }, 'kettle-bot');

  const activity = new Map([[session, Date.parse('2026-10-21T01:30:00Z')]]);

  expect(findAlerts(ctx.db, [{ id: session, name: 'kettle', alive: true, state: 'needs_you' }], activity, new Date('2026-10-21T03:00:00Z'))).toStrictEqual([]);
});

test('it raises the exited alert for a session that ended on a run whose wait is named', () => {
  const ctx = setupTest();
  const session = '98600000-0000-4000-8000-000000000001';
  addRun(ctx.db, { issue: 'GEO-9860', title: 'Invented kettle work', place: 'imp', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  setState(ctx.db, 'GEO-9860', 'working', { next: 'The reviewer rules on kettle#60.', waitsOn: 'the reviewer (ruling on kettle#60)' }, 'kettle-bot');

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z')).map((alert) => alert.line)).toStrictEqual(['GEO-9860: session 98600000 has exited; check for its PR or final note']);
});

test('it raises a FINAL alert for a PR whose only override at its FINAL head is of a CI check', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9828', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  at('2026-10-21T01:00:00Z');
  ctx.seed.finalRunPR({ issue: 'GEO-9828', ref: 'kettle#28' });
  recordCICheckOverride(ctx.db, { repo: 'kettle', pr: 28, head: 'abc1234aaaabbbbccccddddeeeeffff00001111', source: 'chat:kettle-chat@2026-10-21T01:30:00Z', note: 'Invented: the preview is meant to be red.', actor: 'kettle-bot', check: 'preview' });

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([
    { key: 'pr:kettle#28', fingerprint: 'final:abc1234', issue: 'GEO-9828', line: 'kettle#28 (GEO-9828) final at abc1234 for 120 min, no review [from marker:kettle]' },
  ]);
});

test('it raises the exit alert for a build session that left no PR, though its design pass PR has its final review answered', () => {
  const ctx = setupTest();
  at('2026-10-21T00:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9831', title: 'Design the kettle spout', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', design: 'agent', actor: 'kettle-bot' });
  at('2026-10-21T00:10:00Z');
  ctx.seed.finalRunPR({ issue: 'GEO-9831', ref: 'kettle#31' });
  at('2026-10-21T00:20:00Z');
  reviewStarted(ctx.db, 'kettle#31', 'kettle-review');
  at('2026-10-21T00:30:00Z');
  reviewedPr(ctx.db, 'kettle#31', 'abc1234', { recheck: false, force: false }, 'kettle-review');
  setState(ctx.db, 'GEO-9831', 'done', { note: 'design settled' }, 'kettle-bot');
  addRun(ctx.db, { issue: 'GEO-9831', title: 'Build the kettle spout', place: 'imp', session: 'a0000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Building.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });

  const alerts = findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z'));

  expect(alerts).toStrictEqual([{ key: 'session:a0000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fingerprint: 'exited', issue: 'GEO-9831', line: 'GEO-9831: session a0000031 has exited; check for its PR or final note' }]);
});

test('it raises no exit alert for the design pass session the sweep ended, while the build run has no session yet', () => {
  const ctx = setupTest();
  at('2026-10-21T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9861', title: 'Design the kettle spout', place: 'imp', session: 'a0000061-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', design: 'agent', actor: 'kettle-bot' });
  updateGoneRunSessions(ctx.db, [], 'hq-sweep', new Date('2026-10-21T01:30:00Z'));
  at('2026-10-21T01:40:00Z');
  setState(ctx.db, 'GEO-9861', 'done', { note: 'design settled' }, 'kettle-bot');
  addRun(ctx.db, { issue: 'GEO-9861', title: 'Build the kettle spout', place: 'imp', session: null, next: 'Building.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T02:00:00Z'))).toStrictEqual([]);
});

test('it raises no FINAL alert before the review wait ends, and raises it at the date', () => {
  const ctx = setupTest();
  at('2026-10-21T01:00:00Z');
  ctx.seed.run({ issue: 'GEO-9824' });
  ctx.seed.finalRunPR({ issue: 'GEO-9824', ref: 'kettle#24' });
  at('2026-10-21T02:00:00Z');
  setReviewWait(ctx.db, 'kettle#24', { clear: false, until: '2026-10-22T01:00:00Z', reason: 'the only reviewer is out of quota' }, 'kettle-bot');

  const before = findAlerts(ctx.db, [], new Map(), new Date('2026-10-22T00:59:00Z'));
  const after = findAlerts(ctx.db, [], new Map(), new Date('2026-10-22T01:00:00Z'));

  expect(before).toStrictEqual([]);
  expect(after).toStrictEqual([
    { key: 'pr:kettle#24', fingerprint: 'final:abc1234', issue: 'GEO-9824', line: 'kettle#24 (GEO-9824) final at abc1234 for 1440 min, no review [from marker:kettle]' },
  ]);
});

test('it raises the FINAL alert again when a new FINAL at another head follows a review wait', () => {
  const ctx = setupTest();
  at('2026-10-21T01:00:00Z');
  ctx.seed.run({ issue: 'GEO-9825' });
  ctx.seed.finalRunPR({ issue: 'GEO-9825', ref: 'kettle#25' });
  setReviewWait(ctx.db, 'kettle#25', { clear: false, until: '2026-10-25T01:00:00Z', reason: 'the only reviewer is out of quota' }, 'kettle-bot');
  at('2026-10-21T02:00:00Z');
  finalPr(ctx.db, 'kettle#25', { sha: 'def5678', actor: 'kettle-bot' });

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T04:00:00Z'))).toStrictEqual([
    { key: 'pr:kettle#25', fingerprint: 'final:def5678', issue: 'GEO-9825', line: 'kettle#25 (GEO-9825) final at def5678 for 120 min, no review [from cli:kettle-bot]' },
  ]);
});

test('it raises the FINAL alert again when the FINAL is withdrawn and sent again at the same head after a review wait', () => {
  const ctx = setupTest();
  at('2026-10-21T01:00:00Z');
  ctx.seed.run({ issue: 'GEO-9826' });
  ctx.seed.finalRunPR({ issue: 'GEO-9826', ref: 'kettle#26' });
  setReviewWait(ctx.db, 'kettle#26', { clear: false, until: '2026-10-25T01:00:00Z', reason: 'the only reviewer is out of quota' }, 'kettle-bot');
  at('2026-10-21T02:00:00Z');
  unfinalPr(ctx.db, 'kettle#26', 'kettle-bot', 'the head needs one more fix');
  finalPr(ctx.db, 'kettle#26', { sha: 'abc1234', actor: 'kettle-bot' });

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T04:00:00Z'))).toStrictEqual([
    { key: 'pr:kettle#26', fingerprint: 'final:abc1234', issue: 'GEO-9826', line: 'kettle#26 (GEO-9826) final at abc1234 for 120 min, no review [from cli:kettle-bot]' },
  ]);
});

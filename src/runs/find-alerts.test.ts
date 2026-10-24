import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { findAlerts } from './find-alerts.ts';
import { recordPROverride } from '../pr-status/record-pr-override.ts';
import { setSession } from './set-session.ts';
import { addUnblock } from '../unblock/add-unblock.ts';
import { closeUnblock } from '../unblock/close-unblock.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it raises no FINAL alert for a PR whose review started after the FINAL and passed at a newer head', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9821', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9821', 'kettle#21', 'kettle-bot');
  ctx.db
    .query("UPDATE run_prs SET final_sha = 'abc1234', final_at = '2026-10-21T01:00:00Z', final_source = 'marker:kettle', review_started_at = '2026-10-21T01:40:00Z', reviewed_sha = 'def5678', review_round = 1, reviewed_at = '2026-10-21T01:55:00Z' WHERE ref = 'kettle#21'")
    .run();

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([]);
});

test('it raises a FINAL alert for a PR with no review after its FINAL', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9822', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9822', 'kettle#22', 'kettle-bot');
  ctx.db.query("UPDATE run_prs SET final_sha = 'abc1234', final_at = '2026-10-21T01:00:00Z', final_source = 'marker:kettle' WHERE ref = 'kettle#22'").run();

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([
    { key: 'pr:kettle#22', fingerprint: 'final:abc1234', issue: 'GEO-9822', line: 'kettle#22 (GEO-9822) final at abc1234 for 120 min, no review [from marker:kettle]' },
  ]);
});

test('it raises a FINAL alert for a PR whose only review came before its FINAL, at another head', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9823', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9823', 'kettle#23', 'kettle-bot');
  ctx.db
    .query("UPDATE run_prs SET final_sha = 'abc1234', final_at = '2026-10-21T01:00:00Z', final_source = 'marker:kettle', review_started_at = '2026-10-21T00:30:00Z', reviewed_sha = 'def5678', review_round = 1, reviewed_at = '2026-10-21T00:45:00Z' WHERE ref = 'kettle#23'")
    .run();

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([
    { key: 'pr:kettle#23', fingerprint: 'final:abc1234', issue: 'GEO-9823', line: 'kettle#23 (GEO-9823) final at abc1234 for 120 min, no review; head moved since your review at def5678 (a restack? a passed hq review kettle 23 records the new head) [from marker:kettle]' },
  ]);
});

test('it raises no FINAL alert for a PR with an owner override at its FINAL head', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9826', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9826', 'kettle#26', 'kettle-bot');
  ctx.db
    .query("UPDATE run_prs SET final_sha = 'abc1234', final_at = '2026-10-21T01:00:00Z', final_source = 'marker:kettle', reviewed_sha = 'def5678', review_round = 2, reviewed_at = '2026-10-21T00:45:00Z' WHERE ref = 'kettle#26'")
    .run();
  recordPROverride(ctx.db, { repo: 'kettle', pr: 26, head: 'abc1234aaaabbbbccccddddeeeeffff00001111', source: 'chat:kettle-chat@2026-10-21T01:30:00Z', note: 'Invented: the restack kept each fix.', actor: 'kettle-bot' });

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([]);
});

test('it raises a FINAL alert for a PR whose owner override is at an older head', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9827', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9827', 'kettle#27', 'kettle-bot');
  ctx.db.query("UPDATE run_prs SET final_sha = 'abc1234', final_at = '2026-10-21T01:00:00Z', final_source = 'marker:kettle' WHERE ref = 'kettle#27'").run();
  recordPROverride(ctx.db, { repo: 'kettle', pr: 27, head: 'fed9876', source: 'chat:kettle-chat@2026-10-21T00:30:00Z', note: 'Invented: an older head.', actor: 'kettle-bot' });

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([
    { key: 'pr:kettle#27', fingerprint: 'final:abc1234', issue: 'GEO-9827', line: 'kettle#27 (GEO-9827) final at abc1234 for 120 min, no review [from marker:kettle]' },
  ]);
});

test('it raises no exited alert for a session whose PR passed a review round that started after its FINAL, at a newer head', () => {
  const ctx = setupTest();
  const session = '11111111-2222-4333-8444-555555555555';
  addRun(ctx.db, { issue: 'GEO-9824', title: 'Invented kettle work', place: 'imp', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9824', 'kettle#24', 'kettle-bot');
  ctx.db
    .query("UPDATE run_prs SET final_sha = 'abc1234', final_at = '2026-10-21T01:00:00Z', final_source = 'marker:kettle', review_started_at = '2026-10-21T01:40:00Z', reviewed_sha = 'def5678', review_round = 1, reviewed_at = '2026-10-21T01:55:00Z' WHERE ref = 'kettle#24'")
    .run();

  expect(findAlerts(ctx.db, [{ id: session, name: 'kettle', alive: false, state: 'exited' }], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([]);
});

test('it raises an exited alert for a session whose PR was reviewed only before its FINAL', () => {
  const ctx = setupTest();
  const session = '66666666-7777-4888-8999-aaaaaaaaaaaa';
  addRun(ctx.db, { issue: 'GEO-9825', title: 'Invented kettle work', place: 'imp', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9825', 'kettle#25', 'kettle-bot');
  ctx.db
    .query("UPDATE run_prs SET final_sha = 'abc1234', final_at = '2026-10-21T01:00:00Z', final_source = 'marker:kettle', review_started_at = '2026-10-21T00:30:00Z', reviewed_sha = 'def5678', review_round = 1, reviewed_at = '2026-10-21T00:45:00Z' WHERE ref = 'kettle#25'")
    .run();

  const lines = findAlerts(ctx.db, [{ id: session, name: 'kettle', alive: false, state: 'exited' }], new Map(), new Date('2026-10-21T03:00:00Z')).map((alert) => alert.line);

  expect(lines).toContain('GEO-9825: session 66666666 has exited; check for its PR or final note');
});

test('it raises no exited alert for a session whose PR has an owner override at its FINAL head', () => {
  const ctx = setupTest();
  const session = '77777777-8888-4999-8aaa-bbbbbbbbbbbb';
  addRun(ctx.db, { issue: 'GEO-9828', title: 'Invented kettle work', place: 'imp', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9828', 'kettle#28', 'kettle-bot');
  ctx.db
    .query("UPDATE run_prs SET final_sha = 'abc1234', final_at = '2026-10-21T01:00:00Z', final_source = 'marker:kettle', reviewed_sha = 'def5678', review_round = 2, reviewed_at = '2026-10-21T00:45:00Z' WHERE ref = 'kettle#28'")
    .run();
  recordPROverride(ctx.db, { repo: 'kettle', pr: 28, head: 'abc1234aaaabbbbccccddddeeeeffff00001111', source: 'chat:kettle-chat@2026-10-21T01:30:00Z', note: 'Invented: the restack kept each fix.', actor: 'kettle-bot' });

  expect(findAlerts(ctx.db, [{ id: session, name: 'kettle', alive: false, state: 'exited' }], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([]);
});

test('it raises no FINAL alert while the run waits on an open unblock item', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9831', title: 'Invented kettle stack', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9831', 'kettle#31', 'kettle-bot');
  addUnblock(ctx.db, { id: 'u901', task: 'Approve the kettle base layer', minutes: null, unblocks: [], notify: [], actor: 'kettle-review' });
  ctx.db.query("UPDATE runs SET waits_on = 'kettle#30 base, waits on u901' WHERE issue = 'GEO-9831'").run();
  ctx.db.query("UPDATE run_prs SET final_sha = 'abc1234', final_at = '2026-10-21T01:00:00Z', final_source = 'marker:kettle' WHERE ref = 'kettle#31'").run();

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([]);
});

test('it raises the FINAL alert again once the unblock item the run waits on closes', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9832', title: 'Invented kettle stack', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9832', 'kettle#32', 'kettle-bot');
  addUnblock(ctx.db, { id: 'u902', task: 'Approve the kettle base layer', minutes: null, unblocks: [], notify: [], actor: 'kettle-review' });
  closeUnblock(ctx.db, 'u902', 'done', null, 'kettle-review');
  ctx.db.query("UPDATE runs SET waits_on = 'waits on u902' WHERE issue = 'GEO-9832'").run();
  ctx.db.query("UPDATE run_prs SET final_sha = 'abc1234', final_at = '2026-10-21T01:00:00Z', final_source = 'marker:kettle' WHERE ref = 'kettle#32'").run();

  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-21T03:00:00Z'))).toStrictEqual([
    { key: 'pr:kettle#32', fingerprint: 'final:abc1234', issue: 'GEO-9832', line: 'kettle#32 (GEO-9832) final at abc1234 for 120 min, no review [from marker:kettle]' },
  ]);
});

test('it raises the FINAL alert for a run whose wait names no open unblock item', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9833', title: 'Invented kettle stack', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9833', 'kettle#33', 'kettle-bot');
  addUnblock(ctx.db, { id: 'u903', task: 'Approve the kettle base layer', minutes: null, unblocks: [], notify: [], actor: 'kettle-review' });
  ctx.db.query("UPDATE runs SET waits_on = 'waits on u9030 and the kettle release' WHERE issue = 'GEO-9833'").run();
  ctx.db.query("UPDATE run_prs SET final_sha = 'abc1234', final_at = '2026-10-21T01:00:00Z', final_source = 'marker:kettle' WHERE ref = 'kettle#33'").run();

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

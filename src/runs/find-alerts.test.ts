import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { findAlerts } from './find-alerts.ts';

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
    { key: 'pr:kettle#23', fingerprint: 'final:abc1234', issue: 'GEO-9823', line: 'kettle#23 (GEO-9823) final at abc1234 for 120 min, no review; head moved since your review at def5678 (a restack? hq review kettle 23 --fixes-only records the new head) [from marker:kettle]' },
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

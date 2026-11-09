// oxlint-disable zgeoff/test-beside-module -- the whole-program runs suite, from the board through the event feed and the sweep
import { expect, onTestFinished, test } from 'bun:test';
import { updateEnv } from '@zgeoff/testing/helpers';
import type { Database } from 'bun:sqlite';
import invariant from 'tiny-invariant';
import { AtcClient } from '../src/atc/atc-client.ts';
import { getMeta } from '../src/db/get-meta.ts';
import { listEvents } from '../src/list-events.ts';
import { readOutboxRows } from '../src/outbox/read-outbox-rows.ts';
import { addNote } from '../src/runs/add-note.ts';
import { addPr } from '../src/runs/add-pr.ts';
import { addRun } from '../src/runs/add-run.ts';
import { applyNoteSignals } from '../src/runs/apply-note-signals.ts';
import { checkMergedOnGitHub } from '../src/runs/check-merged-on-github.ts';
import { closePr } from '../src/runs/close-pr.ts';
import { finalPr } from '../src/runs/final-pr.ts';
import { findAlerts } from '../src/runs/find-alerts.ts';
import { fullSessionId } from '../src/runs/full-session-id.ts';
import { ingestNotes } from '../src/runs/ingest-notes.ts';
import { listRuns } from '../src/runs/list-runs.ts';
import { normalizePrRef } from '../src/runs/normalize-pr-ref.ts';
import { notesFor } from '../src/runs/notes-for.ts';
import { resolveRun } from '../src/runs/resolve-run.ts';
import { reviewStarted } from '../src/runs/review-started.ts';
import { reviewedPr } from '../src/runs/reviewed-pr.ts';
import { setGeoffChat } from '../src/runs/set-geoff-chat.ts';
import { setSession } from '../src/runs/set-session.ts';
import { setState } from '../src/runs/set-state.ts';
import { SWEEP_MINUTES } from '../src/runs/sweep-minutes.ts';
import { sweepNow } from '../src/runs/sweep-now.ts';
import { updateGoneRunSessions } from '../src/runs/update-gone-run-sessions.ts';
import { sweep } from '../src/runs/sweep.ts';
import { unfinalPr } from '../src/runs/unfinal-pr.ts';
import { unmergePr } from '../src/runs/unmerge-pr.ts';
import { watchlist } from '../src/runs/watchlist.ts';
import { parseJSON } from '../src/noslop/parse-json.ts';
import { buildStubFinalGH } from './build-stub-final-gh.ts';
import { buildStubGitHubFactsRunner } from './build-stub-github-facts-runner.ts';
import type { FakeAtcSession } from './helpers.ts';
import { NOON_SYDNEY, at, fakeAtc } from './helpers.ts';
import { buildSeeder } from '../src/test-utils/build-seeder.ts';
import { writeShippedPR } from '../src/releases/write-shipped-pr.ts';
import { createTestDb } from './create-test-db.ts';

test('#addRun adds a run, does nothing on a relaunch, and resolves it by issue or session prefix', () => {
  const ctx = setupTest();
  expect(ctx.addRun().result).toBe('added');
  expect(ctx.addRun().result).toBe('noop');
  setSession(ctx.db, 'GEO-9001', 'bbbbbbbb-2222-4222-8222-222222222222', 'z-delivery');
  const resolved = resolveRun(ctx.db, 'aaaaaaaa');
  expect(resolved.issue).toBe('GEO-9001');
  expect(watchlist(ctx.db)).toStrictEqual([{ session_id: 'bbbbbbbb-2222-4222-8222-222222222222', issue: 'GEO-9001' }]);
});

test('#addRun refuses a session that is already on another issue', () => {
  const ctx = setupTest();
  ctx.addRun();
  expect(() => ctx.addRun('GEO-9002', 'aaaaaaaa-1111-4111-8111-111111111111')).toThrow('is on GEO-9001');
});

test('#setState closes the row and ends the session on done, and needs --reopen to change it', () => {
  const ctx = setupTest();
  ctx.addRun();
  setState(ctx.db, 'GEO-9001', 'done', { note: 'shipped' }, 'z-delivery');
  expect(listRuns(ctx.db)).toHaveLength(0);
  expect(watchlist(ctx.db)).toStrictEqual([]);
  expect(() => setState(ctx.db, 'GEO-9001', 'working', {}, 'z-delivery')).toThrow('--reopen');
  expect(setState(ctx.db, 'GEO-9001', 'working', { reopen: true }, 'z-delivery').state).toBe('working');
});

test('#setState records what a merged run waits on, and refuses an unknown state', () => {
  const ctx = setupTest();
  ctx.addRun();
  expect(setState(ctx.db, 'GEO-9001', 'merged', { waitsOn: 'widgets 1.2.0 deploy' }, 'z-delivery').waits_on).toBe('widgets 1.2.0 deploy');
  expect(() => setState(ctx.db, 'GEO-9001', 'vibing', {}, 'z-delivery')).toThrow('state must be one of');
});

test('#normalizePrRef normalises a PR ref from a URL or an owner/repo form', () => {
  expect(normalizePrRef('https://github.com/acme/widgets/pull/12')).toStrictEqual({ ref: 'widgets#12', url: 'https://github.com/acme/widgets/pull/12' });
  expect(normalizePrRef('acme/widgets#12').ref).toBe('widgets#12');
  expect(() => normalizePrRef('#12')).toThrow('cannot read a PR');
});

test('#reviewedPr counts review rounds and needs --force for a third', () => {
  const ctx = setupTest();
  ctx.addRun();
  addPr(ctx.db, 'GEO-9001', 'widgets#12', 'z-delivery');
  expect(() => reviewedPr(ctx.db, 'widgets#12', 'abc1234', { recheck: true, force: false }, 'z-delivery')).toThrow('no first review');
  expect(reviewedPr(ctx.db, 'widgets#12', 'abc1234', { recheck: false, force: false }, 'z-delivery').review_round).toBe(1);
  expect(() => reviewedPr(ctx.db, 'widgets#12', 'def5678', { recheck: false, force: false }, 'z-delivery')).toThrow('use --recheck');
  expect(reviewedPr(ctx.db, 'widgets#12', 'def5678', { recheck: true, force: false }, 'z-delivery').review_round).toBe(2);
  expect(() => reviewedPr(ctx.db, 'widgets#12', 'fff0000', { recheck: true, force: false }, 'z-delivery')).toThrow('third round');
});

test('#applyNoteSignals attaches the PR and marks it final on a FINAL marker', () => {
  const ctx = setupTest();
  ctx.addRun();
  const signals = applyNoteSignals(ctx.db, 'GEO-9001', 'FINAL widgets#12 abc1234 all green', { source: 'test' });
  expect(signals.final).toBe('widgets#12');
  expect(listRuns(ctx.db)[0]?.prs[0]).toMatchObject({ ref: 'widgets#12', final_sha: 'abc1234', final_source: 'marker:test' });
});

test('#addNote keeps no note whose final notice cannot be queued, so the same marker marks it final on a retry', () => {
  const ctx = setupTest();
  ctx.addRun();
  ctx.db.run("CREATE TEMP TRIGGER refuse_notice BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'invented: outbox refused'); END");
  expect(() => addNote(ctx.db, 'GEO-9001', 'FINAL widgets#12 abc1234 all green', { label: null, actor: 'z-delivery' })).toThrow('invented: outbox refused');
  expect(ctx.db.query('SELECT COUNT(*) AS total FROM run_notes').get()).toStrictEqual({ total: 0 });
  ctx.db.run('DROP TRIGGER refuse_notice');
  addNote(ctx.db, 'GEO-9001', 'FINAL widgets#12 abc1234 all green', { label: null, actor: 'z-delivery' });
  expect(ctx.db.query("SELECT topic FROM outbox WHERE topic = 'final:widgets#12'").all()).toStrictEqual([{ topic: 'final:widgets#12' }]);
});

test('#addNote leaves an event with the note id and the sha when the note marks a PR final', () => {
  const ctx = setupTest();
  ctx.addRun();
  const note = addNote(ctx.db, 'GEO-9001', 'FINAL widgets#12 abc1234 all green', { label: null, actor: 'z-delivery' });
  const events = listEvents(ctx.db, 'final');
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ subject_id: 'GEO-9001', actor: 'z-delivery', from_state: null, to_state: 'abc1234' });
  expect(events.map((event) => parseJSON(event.data))).toStrictEqual([{ ref: 'widgets#12', sha: 'abc1234', source: 'marker:note:z-delivery', note: note.id, given: 'abc1234', resolved: false, reason: 'not resolved in this pass' }]);
  finalPr(ctx.db, 'widgets#12', { sha: 'def5678', actor: 'z-q' });
  const last = listEvents(ctx.db, 'final').at(-1);
  invariant(last, 'the second final logged an event');
  expect(last).toMatchObject({ from_state: 'abc1234', to_state: 'def5678' });
  expect(JSON.parse(last.data)).toMatchObject({ source: 'cli:z-q', note: null });
});

test("#applyNoteSignals marks the row's only open PR final on today's wording", () => {
  const ctx = setupTest();
  ctx.addRun();
  addPr(ctx.db, 'GEO-9001', 'widgets#12', 'z-delivery');
  expect(applyNoteSignals(ctx.db, 'GEO-9001', 'PR #12 is final again at 39f05fe. CI green.', { source: 'test' }).final).toBe('widgets#12');
});

test('#applyNoteSignals attaches an opened PR and not a merely mentioned one', () => {
  const ctx = setupTest();
  ctx.addRun();
  applyNoteSignals(ctx.db, 'GEO-9001', 'Opened PR https://github.com/acme/widgets/pull/14 for GEO-9001. Rebased after gadgets#3 merged.', { source: 'test' });
  expect(listRuns(ctx.db)[0]?.prs.map((pr) => pr.ref)).toStrictEqual(['widgets#14']);
});

test('#applyNoteSignals marks nothing final when two PRs are open and the note names neither', () => {
  const ctx = setupTest();
  ctx.addRun();
  addPr(ctx.db, 'GEO-9001', 'widgets#12', 'z-delivery');
  addPr(ctx.db, 'GEO-9001', 'widgets#13', 'z-delivery');
  expect(applyNoteSignals(ctx.db, 'GEO-9001', 'it is final at 39f05fe', { source: 'test' }).final).toBeNull();
});

test('#addNote puts a CLI note on the row named by a session prefix', () => {
  const ctx = setupTest();
  ctx.addRun();
  expect(addNote(ctx.db, 'aaaaaaaa', 'checked the kettle', { label: null, actor: 'z-delivery' }).issue).toBe('GEO-9001');
});

test('#ingestNotes starts at the end of the feed on its first run, and keeps later notes of row sessions once', async () => {
  const ctx = setupTest();
  const atc = ctx.startAtc([{ id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', alive: true, state: 'running' }]);
  atc.feed.push({ at: Date.parse('2026-10-14T01:00:00Z'), session: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', kind: 'note', detail: 'old note before hq', label: 'progress' });
  ctx.addRun();
  const client = await AtcClient.open();
  try {
    const boot = await ingestNotes(ctx.db, client, { run: buildStubFinalGH({ commits: 'fault' }, []) });
    expect(boot.bootstrapped).toBe(true);
    atc.feed.push(
      { at: Date.parse('2026-10-14T01:00:01Z'), session: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', kind: 'note', detail: 'FINAL widgets#12 abc1234', label: 'progress' },
      { at: Date.parse('2026-10-14T01:00:02Z'), session: 'cccccccc-0000', name: 'stranger', kind: 'note', detail: 'not ours', label: 'progress' },
      { at: Date.parse('2026-10-14T01:00:03Z'), session: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', kind: 'turn-done', detail: null },
    );
    const ingested = await ingestNotes(ctx.db, client, { run: buildStubFinalGH({ commits: 'fault' }, []) });
    expect(ingested).toMatchObject({ read: 3, notes: 1, unmatched: 1, finals: ['widgets#12'] });
    const again = await ingestNotes(ctx.db, client, { run: buildStubFinalGH({ commits: 'fault' }, []) });
    expect(again.notes).toBe(0);
  } finally {
    client.close();
  }
  expect(notesFor(ctx.db, 'GEO-9001', 10)).toHaveLength(1);
});

test("#sweepNow ends every gone session and repeats a working run's exit alert from the sweep's mark, and a session removed by hand raises none", async () => {
  const ctx = setupTest();
  ctx.startAtc([]);
  const client = await AtcClient.open();
  ctx.addRun();
  ctx.addRun('GEO-9002', 'bbbbbbbb-2222-4222-8222-222222222222');
  ctx.addRun('GEO-9003', 'dddddddd-4444-4444-8444-444444444444');
  setState(ctx.db, 'GEO-9002', 'blocked', { waitsOn: 'a gadgets release' }, 'z-delivery');
  setSession(ctx.db, 'GEO-9003', 'dddddddd-4444-4444-8444-444444444444', 'z-delivery', 'remove');
  at('2026-10-14T01:06:00.000Z');
  try {
    const afterSweep = await sweepNow(ctx.db, client, buildStubGitHubFactsRunner({}), { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.reject(new Error('no wrap-up expected')), readImpWork: () => Promise.reject(new Error('no wrap-up expected')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) }, log: () => {} });
    at(new Date(Date.parse('2026-10-14T01:06:00Z') + SWEEP_MINUTES.repeatMinutes() * 60_000).toISOString());
    const repeatSweep = await sweepNow(ctx.db, client, buildStubGitHubFactsRunner({}), { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.reject(new Error('no wrap-up expected')), readImpWork: () => Promise.reject(new Error('no wrap-up expected')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) }, log: () => {} });
    expect([afterSweep.sent.map((alert) => alert.key), repeatSweep.sent.map((alert) => alert.key), afterSweep.sent[0]?.line]).toStrictEqual([
      ['session:aaaaaaaa-1111-4111-8111-111111111111'],
      ['session:aaaaaaaa-1111-4111-8111-111111111111'],
      'GEO-9001: session aaaaaaaa has exited; wrap it up, or hq run session GEO-9001 aaaaaaaa --remove',
    ]);
  } finally {
    client.close();
  }
  expect(ctx.db.query('SELECT session_id, active, ended_by FROM run_sessions ORDER BY session_id').all()).toStrictEqual([
    { session_id: 'aaaaaaaa-1111-4111-8111-111111111111', active: 0, ended_by: 'sweep' },
    { session_id: 'bbbbbbbb-2222-4222-8222-222222222222', active: 0, ended_by: 'sweep' },
    { session_id: 'dddddddd-4444-4444-8444-444444444444', active: 0, ended_by: null },
  ]);
  setSession(ctx.db, 'GEO-9001', 'aaaaaaaa', 'z-delivery', 'remove');
  expect([findAlerts(ctx.db, [], new Map(), new Date('2026-10-14T01:59:00Z')), ctx.db.query('SELECT ended_by FROM run_sessions WHERE session_id = ?').get('aaaaaaaa-1111-4111-8111-111111111111')]).toStrictEqual([[], { ended_by: null }]);
  expect(() => setSession(ctx.db, 'GEO-9003', 'dddddddd-4444-4444-8444-444444444444', 'z-delivery', 'remove')).toThrow('no active session');
  setSession(ctx.db, 'GEO-9001', 'eeeeeeee-5555-4555-8555-555555555555', 'z-delivery');
  expect(updateGoneRunSessions(ctx.db, [], 'z-delivery', new Date('2026-10-14T02:00:00Z'))).toBe(1);
  at('2026-10-14T02:01:00.000Z');
  setSession(ctx.db, 'GEO-9001', 'aaaaaaaa-1111-4111-8111-111111111111', 'z-delivery');
  expect(findAlerts(ctx.db, [{ id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', alive: true, state: 'running' }], new Map(), new Date('2026-10-14T02:01:00Z'))).toStrictEqual([]);
  at('2026-10-14T02:02:00.000Z');
  setSession(ctx.db, 'GEO-9001', 'aaaaaaaa-1111-4111-8111-111111111111', 'z-delivery', 'remove');
  expect(findAlerts(ctx.db, [], new Map(), new Date('2026-10-14T02:02:00Z'))).toStrictEqual([]);
});

test('#ingestNotes re-syncs a cursor the daemon no longer knows to the end', async () => {
  const ctx = setupTest();
  ctx.startAtc([]);
  ctx.seed.meta({ key: 'atc_events_cursor', value: 'not-a-cursor' });
  const client = await AtcClient.open();
  try {
    const resynced = await ingestNotes(ctx.db, client, { run: buildStubFinalGH({ commits: 'fault' }, []) });
    expect(resynced.reset).toBe(true);
  } finally {
    client.close();
  }
  expect(getMeta(ctx.db, 'atc_events_cursor')).not.toBe('not-a-cursor');
});

test('#ingestNotes catches a cursor past the end of a reset log after three empty reads', async () => {
  const ctx = setupTest();
  const atc = ctx.startAtc([]);
  atc.feed.push({ at: Date.parse('2026-10-14T01:00:00Z'), session: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'x', kind: 'turn-done', detail: null });
  const past = Buffer.from(JSON.stringify(['events', 500])).toString('base64url');
  ctx.seed.meta({ key: 'atc_events_cursor', value: past });
  const client = await AtcClient.open();
  try {
    const first = await ingestNotes(ctx.db, client, { run: buildStubFinalGH({ commits: 'fault' }, []) });
    expect(first.reset).toBe(false);
    const second = await ingestNotes(ctx.db, client, { run: buildStubFinalGH({ commits: 'fault' }, []) });
    expect(second.reset).toBe(false);
    const third = await ingestNotes(ctx.db, client, { run: buildStubFinalGH({ commits: 'fault' }, []) });
    expect(third.reset).toBe(true);
  } finally {
    client.close();
  }
});

test('#findAlerts flags a final PR with no review for 30 min once, then again after 30 more', () => {
  const ctx = setupTest();
  const sessions = [{ id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', alive: true, state: 'running' }];
  ctx.addRun();
  addPr(ctx.db, 'GEO-9001', 'widgets#12', 'z-delivery');
  finalPr(ctx.db, 'widgets#12', { sha: 'abc1234', actor: 'z-delivery' });
  at('2026-10-14T01:29:00.000Z');
  expect(findAlerts(ctx.db, sessions, new Map(), new Date('2026-10-14T01:29:00Z'))).toStrictEqual([]);
  at('2026-10-14T01:31:00.000Z');
  const first = findAlerts(ctx.db, sessions, new Map(), new Date('2026-10-14T01:31:00Z'));
  expect(first[0]?.line).toContain('widgets#12 (GEO-9001) final at abc1234 for 31 min, no review');
  expect(sweep(ctx.db, first, 'hq-lanes').sent).toHaveLength(1);
  at('2026-10-14T01:40:00.000Z');
  const second = findAlerts(ctx.db, sessions, new Map(), new Date('2026-10-14T01:40:00Z'));
  expect(sweep(ctx.db, second, 'hq-lanes').sent).toHaveLength(0);
  at('2026-10-14T02:02:00.000Z');
  const third = findAlerts(ctx.db, sessions, new Map(), new Date('2026-10-14T02:02:00Z'));
  expect(sweep(ctx.db, third, 'hq-lanes').sent).toHaveLength(1);
  expect(readOutboxRows(ctx.db).filter((row) => row.target !== 'z-review')).toHaveLength(1);
});

test('#unfinalPr clears a stale final so the sweep stops, and a new final starts it again', () => {
  const ctx = setupTest();
  const sessions = [{ id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', alive: true, state: 'running' }];
  ctx.addRun();
  addPr(ctx.db, 'GEO-9001', 'widgets#12', 'z-delivery');
  expect(() => unfinalPr(ctx.db, 'widgets#12', 'z-delivery', null)).toThrow('has no final mark');
  finalPr(ctx.db, 'widgets#12', { sha: 'abc1234', actor: 'z-delivery' });
  at('2026-10-14T01:31:00.000Z');
  expect(findAlerts(ctx.db, sessions, new Map(), new Date('2026-10-14T01:31:00Z'))).toHaveLength(1);
  const unfinalled = unfinalPr(ctx.db, 'widgets#12', 'z-delivery', 'head moved; waits on a release');
  expect([unfinalled.final_sha, unfinalled.final_at, unfinalled.final_source]).toStrictEqual([null, null, null]);
  const [event] = listEvents(ctx.db, 'unfinal');
  invariant(event, 'unfinal logged an event');
  expect(event.from_state).toBe('abc1234');
  expect(event.to_state).toBeNull();
  expect(JSON.parse(event.data)).toMatchObject({ ref: 'widgets#12', reason: 'head moved; waits on a release' });
  expect(findAlerts(ctx.db, sessions, new Map(), new Date('2026-10-14T04:20:00Z'))).toStrictEqual([]);
  finalPr(ctx.db, 'widgets#12', { sha: 'def5678', actor: 'z-delivery' });
  at('2026-10-14T05:00:00.000Z');
  expect(findAlerts(ctx.db, sessions, new Map(), new Date('2026-10-14T05:00:00Z'))[0]?.line).toContain('final at def5678');
  closePr(ctx.db, 'widgets#12', { to: 'merged', actor: 'z-delivery' });
  expect(() => unfinalPr(ctx.db, 'widgets#12', 'z-delivery', null)).toThrow('is merged');
});

test('#finalPr tells z-review once for each new final sha, and nothing for the same sha again', () => {
  const ctx = setupTest();
  ctx.addRun();
  addPr(ctx.db, 'GEO-9001', 'widgets#12', 'z-delivery');
  finalPr(ctx.db, 'widgets#12', { sha: 'abc1234', actor: 'z-delivery' });
  finalPr(ctx.db, 'widgets#12', { sha: 'abc1234', actor: 'z-delivery' });
  const first = readOutboxRows(ctx.db).filter((row) => row.target === 'z-review');
  applyNoteSignals(ctx.db, 'GEO-9001', 'FINAL widgets#12 def5678', { source: 'atc:s1' });
  const pending = readOutboxRows(ctx.db).filter((row) => row.target === 'z-review' && row.status === 'pending');

  expect(first.map((row) => ({ text: row.text, topic: row.topic, status: row.status }))).toStrictEqual([{ text: 'Final: GEO-9001 (widgets#12 at abc1234). Review it, then merge.', topic: 'final:widgets#12', status: 'pending' }]);
  expect(pending.map((row) => ({ text: row.text, topic: row.topic, status: row.status }))).toStrictEqual([{ text: 'Final: GEO-9001 (widgets#12 at def5678). Review it, then merge.', topic: 'final:widgets#12', status: 'pending' }]);
});

test('it drops an unsent final notice to z-review on an unfinal, a merge or a close', () => {
  const ctx = setupTest();
  ctx.addRun();
  addPr(ctx.db, 'GEO-9001', 'widgets#12', 'z-delivery');
  addPr(ctx.db, 'GEO-9001', 'widgets#13', 'z-delivery');
  finalPr(ctx.db, 'widgets#12', { sha: 'abc1234', actor: 'z-delivery' });
  finalPr(ctx.db, 'widgets#13', { sha: 'abc5678', actor: 'z-delivery' });
  unfinalPr(ctx.db, 'widgets#12', 'z-delivery', null);
  expect(readOutboxRows(ctx.db).filter((row) => row.target === 'z-review').map((row) => row.topic)).toStrictEqual(['final:widgets#13']);
  closePr(ctx.db, 'widgets#13', { to: 'merged', actor: 'z-review' });
  expect(readOutboxRows(ctx.db).filter((row) => row.target === 'z-review')).toStrictEqual([]);
});

test('#checkMergedOnGitHub passes only a MERGED PR, and refuses an open or closed PR, odd output and a failed gh', async () => {
  const calls: string[][] = [];
  const gh = (code: number, stdout: string) => (cmd: string[]) => {
    calls.push(cmd);

    return Promise.resolve({ code, stdout, stderr: code ? 'invented failure' : '' });
  };
  await checkMergedOnGitHub(gh(0, '{"state":"MERGED","mergedAt":"2026-10-17T05:00:00Z"}'), 'widgets#12');
  expect(calls[0]).toStrictEqual(['gh', 'pr', 'view', '12', '-R', 'zgeoff/widgets', '--json', 'state,mergedAt']);
  await expect(checkMergedOnGitHub(gh(0, '{"state":"OPEN","mergedAt":null}'), 'widgets#12')).rejects.toThrow('widgets#12 is OPEN on GitHub, not merged');
  await expect(checkMergedOnGitHub(gh(0, '{"state":"CLOSED"}'), 'widgets#12')).rejects.toThrow('is CLOSED on GitHub');
  await expect(checkMergedOnGitHub(gh(0, 'not json'), 'widgets#12')).rejects.toThrow('no JSON');
  await expect(checkMergedOnGitHub(gh(1, ''), 'widgets#12')).rejects.toThrow("can't confirm widgets#12 merged");
});

test('#unmergePr puts a wrong merged mark back to open and logs it, keeping the final and review marks', () => {
  const ctx = setupTest();
  ctx.addRun();
  addPr(ctx.db, 'GEO-9001', 'widgets#12', 'z-delivery');
  finalPr(ctx.db, 'widgets#12', { sha: 'abc1234', actor: 'z-delivery' });
  reviewedPr(ctx.db, 'widgets#12', 'abc1234', { recheck: false, force: false }, 'z-review');
  expect(() => unmergePr(ctx.db, 'widgets#12', 'z-review', null)).toThrow('is open, not merged');
  closePr(ctx.db, 'widgets#12', { to: 'merged', actor: 'z-review' });
  const unmerged = unmergePr(ctx.db, 'widgets#12', 'z-review', 'merge failed on a conflict');
  expect(unmerged).toMatchObject({ state: 'open', merged_at: null, final_sha: 'abc1234', reviewed_sha: 'abc1234' });
  const [event] = listEvents(ctx.db, 'unmerged');
  invariant(event, 'unmerge logged an event');
  expect(event).toMatchObject({ from_state: 'merged', to_state: 'open' });
  expect(JSON.parse(event.data)).toMatchObject({ ref: 'widgets#12', reason: 'merge failed on a conflict' });

  finalPr(ctx.db, 'widgets#12', { sha: 'def5678', actor: 'z-delivery' });
});

test('#unmergePr drops the merge commit and the shipment of the wrong merge, and the event keeps them', () => {
  const ctx = setupTest();
  ctx.addRun();
  addPr(ctx.db, 'GEO-9001', 'widgets#12', 'z-delivery');
  closePr(ctx.db, 'widgets#12', { to: 'merged', actor: 'z-review' });
  writeShippedPR(ctx.db, { ref: 'widgets#12', sha: 'c'.repeat(40), tag: 'widgets@1.0.0', at: '2026-10-15T00:00:00Z' });
  expect(unmergePr(ctx.db, 'widgets#12', 'z-review', 'merged the wrong branch')).toMatchObject({ state: 'open', merge_sha: null, shipped_tag: null, shipped_at: null });
  expect(ctx.db.query("SELECT json_extract(data, '$.merge_sha') AS sha, json_extract(data, '$.shipped_tag') AS tag, json_extract(data, '$.shipped_at') AS shipped FROM events WHERE action = 'unmerged'").get()).toStrictEqual({ sha: 'c'.repeat(40), tag: 'widgets@1.0.0', shipped: '2026-10-15T00:00:00Z' });
});

test('#findAlerts stays silent on a final PR after a recent review start, or a review of the final head', () => {
  const ctx = setupTest();
  const sessions = [{ id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', alive: true, state: 'running' }];
  ctx.addRun();
  addPr(ctx.db, 'GEO-9001', 'widgets#12', 'z-delivery');
  finalPr(ctx.db, 'widgets#12', { sha: 'abc1234', actor: 'z-delivery' });
  at('2026-10-14T01:31:00.000Z');
  reviewStarted(ctx.db, 'widgets#12', 'z-delivery');
  expect(findAlerts(ctx.db, sessions, new Map(), new Date('2026-10-14T01:40:00Z'))).toStrictEqual([]);
  reviewedPr(ctx.db, 'widgets#12', 'abc1234', { recheck: false, force: false }, 'z-delivery');
  expect(findAlerts(ctx.db, sessions, new Map(), new Date('2026-10-14T04:20:00Z'))).toStrictEqual([]);
});

test('#findAlerts counts a short final sha and a full reviewed sha of the same commit as reviewed', () => {
  const ctx = setupTest();
  const sessions = [{ id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', alive: true, state: 'running' }];
  ctx.addRun();
  addPr(ctx.db, 'GEO-9001', 'widgets#12', 'z-delivery');
  finalPr(ctx.db, 'widgets#12', { sha: 'abc1234', actor: 'z-delivery' });
  reviewedPr(ctx.db, 'widgets#12', 'abc1234def5678abc1234def5678abc1234def56', { recheck: false, force: false }, 'z-delivery');
  expect(findAlerts(ctx.db, sessions, new Map(), new Date('2026-10-14T01:31:00Z'))).toStrictEqual([]);
  finalPr(ctx.db, 'widgets#12', { sha: 'abc1234def', actor: 'z-delivery' });
  expect(findAlerts(ctx.db, sessions, new Map(), new Date('2026-10-14T01:31:00Z'))).toStrictEqual([]);
});

test('#findAlerts does not flag the unreviewed final PR of a blocked run', () => {
  const ctx = setupTest();
  const sessions = [{ id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', alive: true, state: 'running' }];
  ctx.addRun();
  addPr(ctx.db, 'GEO-9001', 'widgets#12', 'z-delivery');
  finalPr(ctx.db, 'widgets#12', { sha: 'abc1234', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9001', 'blocked', { waitsOn: 'a gadgets release' }, 'z-delivery');
  expect(findAlerts(ctx.db, sessions, new Map(), new Date('2026-10-14T01:31:00Z'))).toStrictEqual([]);
  setState(ctx.db, 'GEO-9001', 'working', {}, 'z-delivery');
  expect(findAlerts(ctx.db, sessions, new Map(), new Date('2026-10-14T01:31:00Z'))).toHaveLength(1);
});

test('#findAlerts flags a head that moved after the review as moved', () => {
  const ctx = setupTest();
  ctx.addRun();
  addPr(ctx.db, 'GEO-9001', 'widgets#12', 'z-delivery');
  reviewedPr(ctx.db, 'widgets#12', 'abc1234', { recheck: false, force: false }, 'z-delivery');
  finalPr(ctx.db, 'widgets#12', { sha: 'def5678', actor: 'z-delivery' });
  expect(findAlerts(ctx.db, [{ id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', alive: true, state: 'running' }], new Map(), new Date('2026-10-14T01:31:00Z'))[0]?.line).toContain('head moved since your review at abc1234');
});

test('#findAlerts does not flag an exited session whose PR is final and reviewed at its head, asleep until its merge window', () => {
  const ctx = setupTest();
  ctx.addRun();
  const gone = [{ id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', alive: false, state: 'exited' }];
  addPr(ctx.db, 'GEO-9001', 'widgets#12', 'z-delivery');
  expect(findAlerts(ctx.db, gone, new Map(), new Date(NOON_SYDNEY))[0]?.line).toContain('has exited');
  finalPr(ctx.db, 'widgets#12', { sha: 'abc1234', actor: 'z-delivery' });
  expect(findAlerts(ctx.db, gone, new Map(), new Date(NOON_SYDNEY))[0]?.line).toContain('has exited');
  reviewedPr(ctx.db, 'widgets#12', 'abc1234', { recheck: false, force: false }, 'z-delivery');
  expect(findAlerts(ctx.db, gone, new Map(), new Date(NOON_SYDNEY))).toStrictEqual([]);

  finalPr(ctx.db, 'widgets#12', { sha: 'def5678', actor: 'z-delivery' });
  expect(findAlerts(ctx.db, gone, new Map(), new Date(NOON_SYDNEY)).map((alert) => alert.line).join('\n')).toContain('has exited');
});

test('#findAlerts flags an exited session, and a quiet one unless the owner chats with it', () => {
  const ctx = setupTest();
  ctx.addRun();
  expect(findAlerts(ctx.db, [{ id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', alive: false, state: 'exited' }], new Map(), new Date(NOON_SYDNEY))[0]?.line).toContain('has exited');
  const quiet = new Map([['aaaaaaaa-1111-4111-8111-111111111111', Date.parse('2026-10-13T23:59:00Z')]]);
  expect(findAlerts(ctx.db, [{ id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', alive: true, state: 'done' }], quiet, new Date(NOON_SYDNEY))[0]?.line).toContain('quiet for 61 min');
  expect(findAlerts(ctx.db, [{ id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', alive: true, state: 'running' }], quiet, new Date(NOON_SYDNEY))).toStrictEqual([]);
  setGeoffChat(ctx.db, 'GEO-9001', true, 'z-delivery');
  expect(findAlerts(ctx.db, [{ id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', alive: true, state: 'needs_you' }], quiet, new Date(NOON_SYDNEY))).toStrictEqual([]);
});

test('#findAlerts never flags a merged PR or a closed row', () => {
  const ctx = setupTest();
  ctx.addRun();
  addPr(ctx.db, 'GEO-9001', 'widgets#12', 'z-delivery');
  finalPr(ctx.db, 'widgets#12', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'widgets#12', { to: 'merged', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9001', 'merged', { waitsOn: 'release' }, 'z-delivery');
  expect(findAlerts(ctx.db, [{ id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', alive: true, state: 'done' }], new Map([['aaaaaaaa-1111-4111-8111-111111111111', 0]]), new Date('2026-10-14T09:20:00Z'))).toStrictEqual([]);
});

test('#ingestNotes keeps the notes in a new feed after a feed reset, and does not double the old ones', async () => {
  const ctx = setupTest();
  const atc = ctx.startAtc([{ id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', alive: true, state: 'running' }]);
  ctx.addRun();
  const client = await AtcClient.open();
  try {
    await ingestNotes(ctx.db, client, { run: buildStubFinalGH({ commits: 'fault' }, []) });
    atc.feed.push({ at: Date.parse('2026-10-14T01:00:01Z'), session: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', kind: 'note', detail: 'first note', label: 'progress' });
    const kept = await ingestNotes(ctx.db, client, { run: buildStubFinalGH({ commits: 'fault' }, []) });
    expect(kept.notes).toBe(1);
    atc.feed.length = 0;
    atc.feed.push(
      { at: Date.parse('2026-10-14T01:00:01Z'), session: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', kind: 'note', detail: 'first note', label: 'progress' },
      { at: Date.parse('2026-10-14T01:00:05Z'), session: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', kind: 'note', detail: 'second note', label: 'progress' },
    );

    await ingestNotes(ctx.db, client, { run: buildStubFinalGH({ commits: 'fault' }, []) });
    await ingestNotes(ctx.db, client, { run: buildStubFinalGH({ commits: 'fault' }, []) });
    await ingestNotes(ctx.db, client, { run: buildStubFinalGH({ commits: 'fault' }, []) });
    await ingestNotes(ctx.db, client, { run: buildStubFinalGH({ commits: 'fault' }, []) });
  } finally {
    client.close();
  }
  const texts = notesFor(ctx.db, 'GEO-9001', 10).map((note) => note.text);
  expect(texts).toStrictEqual(['second note', 'first note']);
});

test('#sweep sends an undelivered alert along with a new one', () => {
  const ctx = setupTest();
  ctx.addRun();
  ctx.addRun('GEO-9002', 'bbbbbbbb-2222-4222-8222-222222222222');
  addPr(ctx.db, 'GEO-9001', 'widgets#12', 'z-delivery');
  finalPr(ctx.db, 'widgets#12', { sha: 'abc1234', actor: 'z-delivery' });
  const kettle = { id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', alive: true, state: 'running' };
  const toaster = { id: 'bbbbbbbb-2222-4222-8222-222222222222', name: 'toaster', alive: true, state: 'running' };
  at('2026-10-14T01:31:00.000Z');
  sweep(ctx.db, findAlerts(ctx.db, [kettle, toaster], new Map(), new Date('2026-10-14T01:31:00Z')), 'hq-lanes');
  at('2026-10-14T01:36:00.000Z');
  const gone = [kettle, { ...toaster, alive: false, state: 'exited' }];
  const swept = sweep(ctx.db, findAlerts(ctx.db, gone, new Map(), new Date('2026-10-14T01:36:00Z')), 'hq-lanes');
  expect(swept.sent.map((alert) => alert.key).toSorted()).toStrictEqual(['pr:widgets#12', 'session:bbbbbbbb-2222-4222-8222-222222222222']);
  const messages = readOutboxRows(ctx.db).filter((row) => row.target !== 'z-review');
  expect(messages).toHaveLength(1);
  expect(messages[0]?.text).toContain('widgets#12');
  expect(messages[0]?.text).toContain('has exited');
});

test("#applyNoteSignals never marks this row's PR final from a note about another repo's PR", () => {
  const ctx = setupTest();
  ctx.addRun();
  addPr(ctx.db, 'GEO-9001', 'widgets#12', 'z-delivery');
  expect(applyNoteSignals(ctx.db, 'GEO-9001', 'gadgets#99 is final at abc1234', { source: 'test' }).final).toBeNull();
  expect(listRuns(ctx.db)[0]?.prs[0]?.final_sha).toBeNull();
});

test('#ingestNotes reads the whole new feed from its oldest event when it recovers from a reset', async () => {
  const ctx = setupTest();
  const atc = ctx.startAtc([{ id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', alive: true, state: 'running' }]);
  ctx.seed.run({ issue: 'GEO-9001', title: 'Teach the kettle to whistle', session: 'aaaaaaaa-1111-4111-8111-111111111111', actor: 'z-delivery' });
  atc.feed.push(
    ...Array.from({ length: 201 }, (_, index) => ({ at: Date.parse('2026-10-14T01:00:00Z') + index * 1000, session: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', kind: 'note', detail: `note ${index}`, label: 'progress' })),
  );
  ctx.seed.meta({ key: 'atc_events_cursor', value: 'not-a-cursor' });
  const client = await AtcClient.open();
  try {
    const reset = await ingestNotes(ctx.db, client, { run: buildStubFinalGH({ commits: 'fault' }, []) });
    expect(reset.reset).toBe(true);
    await ingestNotes(ctx.db, client, { run: buildStubFinalGH({ commits: 'fault' }, []) });
  } finally {
    client.close();
  }
  expect(notesFor(ctx.db, 'GEO-9001', 1000)).toHaveLength(201);
});

test('#applyNoteSignals marks nothing from a phrase in a note that names a foreign PR', () => {
  const ctx = setupTest();
  ctx.addRun();
  addPr(ctx.db, 'GEO-9001', 'widgets#12', 'z-delivery');
  addPr(ctx.db, 'GEO-9001', 'widgets#13', 'z-delivery');
  expect(applyNoteSignals(ctx.db, 'GEO-9001', 'Rebased widgets#12. gadgets#99 is final at abc1234', { source: 'test' }).final).toBeNull();
  expect(listRuns(ctx.db)[0]?.prs.every((pr) => pr.final_sha === null)).toBe(true);
  expect(applyNoteSignals(ctx.db, 'GEO-9001', 'widgets#13 is final at abc1234', { source: 'test' }).final).toBe('widgets#13');
});

test('#ingestNotes keeps two identical notes in the same second as two', async () => {
  const ctx = setupTest();
  const atc = ctx.startAtc([{ id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', alive: true, state: 'running' }]);
  ctx.addRun();
  const client = await AtcClient.open();
  try {
    await ingestNotes(ctx.db, client, { run: buildStubFinalGH({ commits: 'fault' }, []) });
    atc.feed.push(
      { at: Date.parse('2026-10-14T01:00:00.100Z'), session: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', kind: 'note', detail: 'tick', label: 'progress' },
      { at: Date.parse('2026-10-14T01:00:00.900Z'), session: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', kind: 'note', detail: 'tick', label: 'progress' },
    );
    const ticks = await ingestNotes(ctx.db, client, { run: buildStubFinalGH({ commits: 'fault' }, []) });
    expect(ticks.notes).toBe(2);
  } finally {
    client.close();
  }
});

test('#setSession adds a helper beside the main session, and both are watched and swept', () => {
  const ctx = setupTest();
  ctx.addRun();
  setSession(ctx.db, 'GEO-9001', 'bbbbbbbb-2222-4222-8222-222222222222', 'z-delivery', 'add');
  expect(watchlist(ctx.db).map((watched) => watched.session_id).toSorted()).toStrictEqual(['aaaaaaaa-1111-4111-8111-111111111111', 'bbbbbbbb-2222-4222-8222-222222222222']);
  const gone = [
    { id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'kettle', alive: true, state: 'running' },
    { id: 'bbbbbbbb-2222-4222-8222-222222222222', name: 'helper', alive: false, state: 'exited' },
  ];
  expect(findAlerts(ctx.db, gone, new Map(), new Date(NOON_SYDNEY))[0]?.line).toContain('helper session bbbbbbbb has exited');
});

test('#setSession replaces the main session on a relaunch and keeps the helper', () => {
  const ctx = setupTest();
  ctx.addRun();
  setSession(ctx.db, 'GEO-9001', 'bbbbbbbb-2222-4222-8222-222222222222', 'z-delivery', 'add');
  setSession(ctx.db, 'GEO-9001', 'cccccccc-3333-4333-8333-333333333333', 'z-delivery');
  expect(watchlist(ctx.db).map((watched) => watched.session_id).toSorted()).toStrictEqual(['bbbbbbbb-2222-4222-8222-222222222222', 'cccccccc-3333-4333-8333-333333333333']);
});

test('#setSession stops watching a removed helper, and refuses an unknown one', () => {
  const ctx = setupTest();
  ctx.addRun();
  setSession(ctx.db, 'GEO-9001', 'bbbbbbbb-2222-4222-8222-222222222222', 'z-delivery', 'add');
  setSession(ctx.db, 'GEO-9001', 'bbbbbbbb', 'z-delivery', 'remove');
  expect(watchlist(ctx.db).map((watched) => watched.session_id)).toStrictEqual(['aaaaaaaa-1111-4111-8111-111111111111']);
  expect(() => setSession(ctx.db, 'GEO-9001', 'bbbbbbbb', 'z-delivery', 'remove')).toThrow('no active session');
});

test('#setSession keeps the current main session main when it is added again', () => {
  const ctx = setupTest();
  ctx.addRun();
  setSession(ctx.db, 'GEO-9001', 'aaaaaaaa-1111-4111-8111-111111111111', 'z-delivery', 'add');
  expect(listRuns(ctx.db)[0]?.sessions.find((session) => session.session_id === 'aaaaaaaa-1111-4111-8111-111111111111')).toMatchObject({ active: 1, helper: 0 });
});

test('#fullSessionId passes a full id without atc, expands a unique prefix, and refuses others', async () => {
  const fromFullID = await fullSessionId(() => Promise.reject(new Error('no daemon')), 'BBBBBBBB-2222-4222-8222-222222222222');
  expect(fromFullID).toBe('bbbbbbbb-2222-4222-8222-222222222222');
  const fromPrefix = await fullSessionId(() => Promise.resolve([{ id: 'aaaaaaaa-1111-4111-8111-111111111111' }, { id: 'bbbbbbbb-2222-4222-8222-222222222222' }, { id: 'aaaaaaaa-9999-4999-8999-999999999999' }]), 'bbbbbbbb');
  expect(fromPrefix).toBe('bbbbbbbb-2222-4222-8222-222222222222');
  await expect(fullSessionId(() => Promise.resolve([{ id: 'aaaaaaaa-1111-4111-8111-111111111111' }, { id: 'bbbbbbbb-2222-4222-8222-222222222222' }, { id: 'aaaaaaaa-9999-4999-8999-999999999999' }]), 'aaaaaaaa')).rejects.toThrow('2 sessions start with aaaaaaaa');
  await expect(fullSessionId(() => Promise.resolve([{ id: 'aaaaaaaa-1111-4111-8111-111111111111' }, { id: 'bbbbbbbb-2222-4222-8222-222222222222' }, { id: 'aaaaaaaa-9999-4999-8999-999999999999' }]), 'cccccccc')).rejects.toThrow('no atc session starts with cccccccc');
  await expect(fullSessionId(() => Promise.reject(new Error('no daemon')), 'bbbbbbbb')).rejects.toThrow('give the full id');
  await expect(fullSessionId(() => Promise.resolve([{ id: 'aaaaaaaa-1111-4111-8111-111111111111' }, { id: 'bbbbbbbb-2222-4222-8222-222222222222' }, { id: 'aaaaaaaa-9999-4999-8999-999999999999' }]), 'kettle')).rejects.toThrow('must be an atc session id');
});

function setupTest() {
  const fresh = createTestDb();
  at(NOON_SYDNEY);

  // fakeAtc assigns HQ_ATC_SOCKET itself, so record the value the preload puts back before it runs.
  updateEnv('HQ_ATC_SOCKET', process.env['HQ_ATC_SOCKET']);
  const db: Database = fresh.db;

  return {
    db,
    directory: fresh.dir,
    seed: buildSeeder(fresh),
    addRun: (issue = 'GEO-9001', session: string | null = 'aaaaaaaa-1111-4111-8111-111111111111') =>
      addRun(db, { issue, title: 'Teach the kettle to whistle', place: 'imp', session, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' }),
    startAtc: (sessions: FakeAtcSession[]) => {
      const atc = fakeAtc(fresh.dir, sessions);
      onTestFinished(() => atc.stop());

      return atc;
    },
  };
}

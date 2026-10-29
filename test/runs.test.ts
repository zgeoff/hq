import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { AtcClient } from '../src/atc/atc-client.ts';
import { getMeta } from '../src/db/get-meta.ts';
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
import { buildStubGitHubFactsRunner } from './build-stub-github-facts-runner.ts';
import { type FakeAtc, NOON_SYDNEY, at, fakeAtc, freshDb } from './helpers.ts';

let db: Database;
let dir: string;
let cleanup: () => void;
let atc: FakeAtc | null = null;

const S1 = 'aaaaaaaa-1111-4111-8111-111111111111';
const S2 = 'bbbbbbbb-2222-4222-8222-222222222222';
const base = new Date(NOON_SYDNEY).getTime();
const atMin = (m: number) => at(new Date(base + m * 60_000).toISOString());
const add = (issue = 'GEO-9001', session: string | null = S1) =>
  addRun(db, { issue, title: 'Teach the kettle to whistle', place: 'imp', session, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' });
// The sweep's messages; z-review's final messages have their own test.
const outbox = () => db.query(`SELECT target, text FROM outbox WHERE target != 'z-review'`).all() as { target: string; text: string }[];
const toReview = () => db.query(`SELECT text, topic, status FROM outbox WHERE target = 'z-review' ORDER BY id`).all() as { text: string; topic: string; status: string }[];

beforeEach(() => {
  ({ db, dir, cleanup } = freshDb());
  at(NOON_SYDNEY);
});
afterEach(() => {
  atc?.stop();
  atc = null;
  cleanup();
});

describe('the board', () => {
  test('add, relaunch, and resolve by issue or session prefix', () => {
    expect(add().result).toBe('added');
    expect(add().result).toBe('noop');
    setSession(db, 'GEO-9001', S2, 'z-delivery');
    const r = resolveRun(db, 'aaaaaaaa');
    expect(r.issue).toBe('GEO-9001');
    expect(watchlist(db)).toEqual([{ session_id: S2, issue: 'GEO-9001' }]);
  });

  test('a session belongs to one issue', () => {
    add();
    expect(() => add('GEO-9002', S1)).toThrow('is on GEO-9001');
  });

  test('done closes the row, ends the session, and needs --reopen to change', () => {
    add();
    setState(db, 'GEO-9001', 'done', { note: 'shipped' }, 'z-delivery');
    expect(listRuns(db)).toHaveLength(0);
    expect(watchlist(db)).toEqual([]);
    expect(() => setState(db, 'GEO-9001', 'working', {}, 'z-delivery')).toThrow('--reopen');
    expect(setState(db, 'GEO-9001', 'working', { reopen: true }, 'z-delivery').state).toBe('working');
  });

  test('merged waits on a release; unknown states are refused', () => {
    add();
    expect(setState(db, 'GEO-9001', 'merged', { waitsOn: 'widgets 1.2.0 deploy' }, 'z-delivery').waits_on).toBe('widgets 1.2.0 deploy');
    expect(() => setState(db, 'GEO-9001', 'vibing', {}, 'z-delivery')).toThrow('state must be one of');
  });

  test('PR refs normalise from URLs and owner/repo forms', () => {
    expect(normalizePrRef('https://github.com/acme/widgets/pull/12')).toEqual({ ref: 'widgets#12', url: 'https://github.com/acme/widgets/pull/12' });
    expect(normalizePrRef('acme/widgets#12').ref).toBe('widgets#12');
    expect(() => normalizePrRef('#12')).toThrow('cannot read a PR');
  });
});

describe('reviews: one round plus one re-check', () => {
  test('rounds are counted and a third needs --force', () => {
    add();
    addPr(db, 'GEO-9001', 'widgets#12', 'z-delivery');
    expect(() => reviewedPr(db, 'widgets#12', 'abc1234', { recheck: true, force: false }, 'z-delivery')).toThrow('no first review');
    expect(reviewedPr(db, 'widgets#12', 'abc1234', { recheck: false, force: false }, 'z-delivery').review_round).toBe(1);
    expect(() => reviewedPr(db, 'widgets#12', 'def5678', { recheck: false, force: false }, 'z-delivery')).toThrow('use --recheck');
    expect(reviewedPr(db, 'widgets#12', 'def5678', { recheck: true, force: false }, 'z-delivery').review_round).toBe(2);
    expect(() => reviewedPr(db, 'widgets#12', 'fff0000', { recheck: true, force: false }, 'z-delivery')).toThrow('third round');
  });
});

describe('note signals', () => {
  test('the FINAL marker attaches the PR and marks it final', () => {
    add();
    const sig = applyNoteSignals(db, 'GEO-9001', 'FINAL widgets#12 abc1234 all green', 'test');
    expect(sig.final).toBe('widgets#12');
    expect(listRuns(db)[0]!.prs[0]).toMatchObject({ ref: 'widgets#12', final_sha: 'abc1234', final_source: 'marker:test' });
  });

  test('a note whose final notice cannot be queued is not kept, so the same marker marks it final on a retry', () => {
    add();
    db.run("CREATE TEMP TRIGGER refuse_notice BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'invented: outbox refused'); END");
    expect(() => addNote(db, 'GEO-9001', 'FINAL widgets#12 abc1234 all green', null, 'z-delivery')).toThrow('invented: outbox refused');
    expect(db.query('SELECT COUNT(*) AS total FROM run_notes').get()).toStrictEqual({ total: 0 });
    db.run('DROP TRIGGER refuse_notice');
    addNote(db, 'GEO-9001', 'FINAL widgets#12 abc1234 all green', null, 'z-delivery');
    expect(db.query("SELECT topic FROM outbox WHERE topic = 'final:widgets#12'").all()).toStrictEqual([{ topic: 'final:widgets#12' }]);
  });

  test('a note that marks a PR final leaves an event with the note id and the sha', () => {
    add();
    const note = addNote(db, 'GEO-9001', 'FINAL widgets#12 abc1234 all green', null, 'z-delivery');
    const ev = db.query(`SELECT subject_id, action, actor, from_state, to_state, data FROM events WHERE action = 'final'`).all() as { data: string }[];
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ subject_id: 'GEO-9001', actor: 'z-delivery', from_state: null, to_state: 'abc1234' });
    expect(JSON.parse(ev[0]!.data)).toEqual({ ref: 'widgets#12', sha: 'abc1234', source: 'marker:note:z-delivery', note: note.id });
    finalPr(db, 'widgets#12', 'def5678', 'z-q');
    const last = db.query(`SELECT from_state, to_state, data FROM events WHERE action = 'final' ORDER BY seq DESC LIMIT 1`).get() as { data: string };
    expect(last).toMatchObject({ from_state: 'abc1234', to_state: 'def5678' });
    expect(JSON.parse(last.data)).toMatchObject({ source: 'cli:z-q', note: null });
  });

  test("today's wording marks the row's only open PR final", () => {
    add();
    addPr(db, 'GEO-9001', 'widgets#12', 'z-delivery');
    expect(applyNoteSignals(db, 'GEO-9001', 'PR #12 is final again at 39f05fe. CI green.', 'test').final).toBe('widgets#12');
  });

  test('an opened PR is attached; a merely mentioned one is not', () => {
    add();
    applyNoteSignals(db, 'GEO-9001', 'Opened PR https://github.com/acme/widgets/pull/14 for GEO-9001. Rebased after gadgets#3 merged.', 'test');
    expect(listRuns(db)[0]!.prs.map((p) => p.ref)).toEqual(['widgets#14']);
  });

  test('with two open PRs and no named one, the phrase marks nothing', () => {
    add();
    addPr(db, 'GEO-9001', 'widgets#12', 'z-delivery');
    addPr(db, 'GEO-9001', 'widgets#13', 'z-delivery');
    expect(applyNoteSignals(db, 'GEO-9001', 'it is final at 39f05fe', 'test').final).toBeNull();
  });

  test('a cli note by session prefix lands on the row', () => {
    add();
    expect(addNote(db, 'aaaaaaaa', 'checked the kettle', null, 'z-delivery').issue).toBe('GEO-9001');
  });
});

describe('reading the event feed', () => {
  test('first run starts at the end; later notes for row sessions are kept once', async () => {
    atc = fakeAtc(dir, [{ id: S1, name: 'kettle', alive: true, state: 'running' }]);
    atc.feed.push({ at: base, session: S1, name: 'kettle', kind: 'note', detail: 'old note before hq', label: 'progress' });
    add();
    const c = await AtcClient.open();
    try {
      expect((await ingestNotes(db, c)).bootstrapped).toBe(true);
      atc.feed.push({ at: base + 1000, session: S1, name: 'kettle', kind: 'note', detail: 'FINAL widgets#12 abc1234', label: 'progress' });
      atc.feed.push({ at: base + 2000, session: 'cccccccc-0000', name: 'stranger', kind: 'note', detail: 'not ours', label: 'progress' });
      atc.feed.push({ at: base + 3000, session: S1, name: 'kettle', kind: 'turn-done', detail: null });
      const r = await ingestNotes(db, c);
      expect(r).toMatchObject({ read: 3, notes: 1, unmatched: 1, finals: ['widgets#12'] });
      expect((await ingestNotes(db, c)).notes).toBe(0);
    } finally {
      c.close();
    }
    expect((db.query('SELECT COUNT(*) AS n FROM run_notes').get() as { n: number }).n).toBe(1);
  });

  test('a sweep ends every gone session, and a working run\'s exit alert repeats from the sweep\'s mark; a session removed by hand raises none', async () => {
    const BY_HAND = 'dddddddd-4444-4444-8444-444444444444',
      HANDOFF = 'eeeeeeee-5555-4555-8555-555555555555',
      atcFake = fakeAtc(dir, []),
      c = await AtcClient.open();
    atc = atcFake;
    add();
    add('GEO-9002', S2);
    add('GEO-9003', BY_HAND);
    setState(db, 'GEO-9002', 'blocked', { waitsOn: 'a gadgets release' }, 'z-delivery');
    setSession(db, 'GEO-9003', BY_HAND, 'z-delivery', 'remove');
    atMin(6);
    try {
      const afterSweep = await sweepNow(db, c, buildStubGitHubFactsRunner({}), { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.reject(new Error('no wrap-up expected')), readImpWork: () => Promise.reject(new Error('no wrap-up expected')) }, log: () => {} });
      atMin(6 + SWEEP_MINUTES.repeatMinutes());
      const repeatSweep = await sweepNow(db, c, buildStubGitHubFactsRunner({}), { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.reject(new Error('no wrap-up expected')), readImpWork: () => Promise.reject(new Error('no wrap-up expected')) }, log: () => {} });
      expect([afterSweep.sent.map((a) => a.key), repeatSweep.sent.map((a) => a.key), afterSweep.sent[0]?.line]).toEqual([
        [`session:${S1}`],
        [`session:${S1}`],
        'GEO-9001: session aaaaaaaa has exited; wrap it up, or hq run session GEO-9001 aaaaaaaa --remove',
      ]);
    } finally {
      c.close();
    }
    expect(db.query('SELECT session_id, active, ended_by FROM run_sessions ORDER BY session_id').all()).toEqual([
      { session_id: S1, active: 0, ended_by: 'sweep' },
      { session_id: S2, active: 0, ended_by: 'sweep' },
      { session_id: BY_HAND, active: 0, ended_by: null },
    ]);
    setSession(db, 'GEO-9001', 'aaaaaaaa', 'z-delivery', 'remove');
    expect([findAlerts(db, [], new Map(), new Date(base + 59 * 60_000)), db.query('SELECT ended_by FROM run_sessions WHERE session_id = ?').get(S1)]).toEqual([[], { ended_by: null }]);
    expect(() => setSession(db, 'GEO-9003', BY_HAND, 'z-delivery', 'remove')).toThrow('no active session');
    setSession(db, 'GEO-9001', HANDOFF, 'z-delivery');
    expect(updateGoneRunSessions(db, [], 'z-delivery', new Date(base + 60 * 60_000))).toBe(1);
    atMin(61);
    setSession(db, 'GEO-9001', S1, 'z-delivery');
    expect(findAlerts(db, [{ id: S1, name: 'kettle', alive: true, state: 'running' }], new Map(), new Date(base + 61 * 60_000))).toEqual([]);
    atMin(62);
    setSession(db, 'GEO-9001', S1, 'z-delivery', 'remove');
    expect(findAlerts(db, [], new Map(), new Date(base + 62 * 60_000))).toEqual([]);
  });

  test('a cursor the daemon no longer knows is re-synced to the end', async () => {
    atc = fakeAtc(dir, []);
    db.query(`INSERT INTO meta (key, value) VALUES ('atc_events_cursor', 'not-a-cursor')`).run();
    const c = await AtcClient.open();
    try {
      expect((await ingestNotes(db, c)).reset).toBe(true);
    } finally {
      c.close();
    }
    expect(getMeta(db, 'atc_events_cursor')).not.toBe('not-a-cursor');
  });

  test('a cursor past the end (log reset) is caught after three empty reads', async () => {
    atc = fakeAtc(dir, []);
    atc.feed.push({ at: base, session: S1, name: 'x', kind: 'turn-done', detail: null });
    const past = Buffer.from(JSON.stringify(['events', 500])).toString('base64url');
    db.query(`INSERT INTO meta (key, value) VALUES ('atc_events_cursor', ?)`).run(past);
    const c = await AtcClient.open();
    try {
      expect((await ingestNotes(db, c)).reset).toBe(false);
      expect((await ingestNotes(db, c)).reset).toBe(false);
      expect((await ingestNotes(db, c)).reset).toBe(true);
    } finally {
      c.close();
    }
  });
});

describe('the sweep', () => {
  const alive = (state = 'running') => [{ id: S1, name: 'kettle', alive: true, state }];

  test('a final PR with no review for 30 min is flagged once, then after 30 more', () => {
    add();
    addPr(db, 'GEO-9001', 'widgets#12', 'z-delivery');
    finalPr(db, 'widgets#12', 'abc1234', 'z-delivery');
    atMin(29);
    expect(findAlerts(db, alive(), new Map(), new Date(base + 29 * 60_000))).toEqual([]);
    atMin(31);
    let a = findAlerts(db, alive(), new Map(), new Date(base + 31 * 60_000));
    expect(a[0]!.line).toContain('widgets#12 (GEO-9001) final at abc1234 for 31 min, no review');
    expect(sweep(db, a, 'hq-lanes').sent).toHaveLength(1);
    atMin(40);
    a = findAlerts(db, alive(), new Map(), new Date(base + 40 * 60_000));
    expect(sweep(db, a, 'hq-lanes').sent).toHaveLength(0);
    atMin(62);
    a = findAlerts(db, alive(), new Map(), new Date(base + 62 * 60_000));
    expect(sweep(db, a, 'hq-lanes').sent).toHaveLength(1);
    expect(outbox()).toHaveLength(1); // the unsent first one was superseded
  });

  test('hq run unfinal clears a stale final: the sweep stops, a new final starts it again', () => {
    add();
    addPr(db, 'GEO-9001', 'widgets#12', 'z-delivery');
    expect(() => unfinalPr(db, 'widgets#12', 'z-delivery', null)).toThrow('has no final mark');
    finalPr(db, 'widgets#12', 'abc1234', 'z-delivery');
    atMin(31);
    expect(findAlerts(db, alive(), new Map(), new Date(base + 31 * 60_000))).toHaveLength(1);
    const p = unfinalPr(db, 'widgets#12', 'z-delivery', 'head moved; waits on a release');
    expect([p.final_sha, p.final_at, p.final_source]).toEqual([null, null, null]);
    const ev = db.query(`SELECT from_state AS from_value, to_state AS to_value, data FROM events WHERE action = 'unfinal'`).get() as { from_value: string; to_value: string | null; data: string };
    expect(ev.from_value).toBe('abc1234');
    expect(ev.to_value).toBeNull();
    expect(JSON.parse(ev.data)).toMatchObject({ ref: 'widgets#12', reason: 'head moved; waits on a release' });
    expect(findAlerts(db, alive(), new Map(), new Date(base + 200 * 60_000))).toEqual([]);
    finalPr(db, 'widgets#12', 'def5678', 'z-delivery');
    atMin(240);
    expect(findAlerts(db, alive(), new Map(), new Date(base + 240 * 60_000))[0]!.line).toContain('final at def5678');
    closePr(db, 'widgets#12', { to: 'merged', actor: 'z-delivery' });
    expect(() => unfinalPr(db, 'widgets#12', 'z-delivery', null)).toThrow('is merged');
  });

  test('each new final sha tells z-review once; the same sha again tells nothing', () => {
    add();
    addPr(db, 'GEO-9001', 'widgets#12', 'z-delivery');
    finalPr(db, 'widgets#12', 'abc1234', 'z-delivery');
    finalPr(db, 'widgets#12', 'abc1234', 'z-delivery');
    expect(toReview()).toEqual([{ text: 'Final: GEO-9001 (widgets#12 at abc1234). Review it, then merge.', topic: 'final:widgets#12', status: 'pending' }]);
    // The head moved: the new final replaces the unsent older message.
    applyNoteSignals(db, 'GEO-9001', 'FINAL widgets#12 def5678', 'atc:s1');
    const m = toReview().filter((x) => x.status === 'pending');
    expect(m).toEqual([{ text: 'Final: GEO-9001 (widgets#12 at def5678). Review it, then merge.', topic: 'final:widgets#12', status: 'pending' }]);
  });

  test('unfinal, a merge or a close drops an unsent final notice to z-review', () => {
    add();
    addPr(db, 'GEO-9001', 'widgets#12', 'z-delivery');
    addPr(db, 'GEO-9001', 'widgets#13', 'z-delivery');
    finalPr(db, 'widgets#12', 'abc1234', 'z-delivery');
    finalPr(db, 'widgets#13', 'abc5678', 'z-delivery');
    unfinalPr(db, 'widgets#12', 'z-delivery', null);
    expect(toReview().map((x) => x.topic)).toEqual(['final:widgets#13']);
    closePr(db, 'widgets#13', { to: 'merged', actor: 'z-review' });
    expect(toReview()).toEqual([]);
  });

  test('hq run merged asks GitHub: only MERGED passes; open, closed, odd output and a failed gh refuse', async () => {
    const calls: string[][] = [];
    const gh = (code: number, stdout: string) => async (cmd: string[]) => (calls.push(cmd), { code, stdout, stderr: code ? 'invented failure' : '' });
    await checkMergedOnGitHub(gh(0, '{"state":"MERGED","mergedAt":"2026-10-17T05:00:00Z"}'), 'widgets#12');
    expect(calls[0]).toEqual(['gh', 'pr', 'view', '12', '-R', 'zgeoff/widgets', '--json', 'state,mergedAt']);
    await expect(checkMergedOnGitHub(gh(0, '{"state":"OPEN","mergedAt":null}'), 'widgets#12')).rejects.toThrow('widgets#12 is OPEN on GitHub, not merged');
    await expect(checkMergedOnGitHub(gh(0, '{"state":"CLOSED"}'), 'widgets#12')).rejects.toThrow('is CLOSED on GitHub');
    await expect(checkMergedOnGitHub(gh(0, 'not json'), 'widgets#12')).rejects.toThrow('no JSON');
    await expect(checkMergedOnGitHub(gh(1, ''), 'widgets#12')).rejects.toThrow("can't confirm widgets#12 merged");
  });

  test('hq run unmerge puts a wrong merged mark back to open and logs it; final and review marks stay', () => {
    add();
    addPr(db, 'GEO-9001', 'widgets#12', 'z-delivery');
    finalPr(db, 'widgets#12', 'abc1234', 'z-delivery');
    reviewedPr(db, 'widgets#12', 'abc1234', { recheck: false, force: false }, 'z-review');
    expect(() => unmergePr(db, 'widgets#12', 'z-review', null)).toThrow('is open, not merged');
    closePr(db, 'widgets#12', { to: 'merged', actor: 'z-review' });
    const p = unmergePr(db, 'widgets#12', 'z-review', 'merge failed on a conflict');
    expect(p).toMatchObject({ state: 'open', merged_at: null, final_sha: 'abc1234', reviewed_sha: 'abc1234' });
    const ev = db.query(`SELECT from_state, to_state, data FROM events WHERE action = 'unmerged'`).get() as { from_state: string; to_state: string; data: string };
    expect(ev).toMatchObject({ from_state: 'merged', to_state: 'open' });
    expect(JSON.parse(ev.data)).toMatchObject({ ref: 'widgets#12', reason: 'merge failed on a conflict' });
    finalPr(db, 'widgets#12', 'def5678', 'z-delivery'); // a final works again
  });

  test('unmerge drops the merge commit and the shipment of the wrong merge, and the event keeps them', () => {
    add();
    addPr(db, 'GEO-9001', 'widgets#12', 'z-delivery');
    closePr(db, 'widgets#12', { to: 'merged', actor: 'z-review' });
    db.query("UPDATE run_prs SET merge_sha = ?, shipped_tag = 'widgets@1.0.0', shipped_at = '2026-10-15T00:00:00Z' WHERE ref = 'widgets#12'").run('c'.repeat(40));
    expect(unmergePr(db, 'widgets#12', 'z-review', 'merged the wrong branch')).toMatchObject({ state: 'open', merge_sha: null, shipped_tag: null, shipped_at: null });
    expect(db.query("SELECT json_extract(data, '$.merge_sha') AS sha, json_extract(data, '$.shipped_tag') AS tag, json_extract(data, '$.shipped_at') AS shipped FROM events WHERE action = 'unmerged'").get()).toStrictEqual({ sha: 'c'.repeat(40), tag: 'widgets@1.0.0', shipped: '2026-10-15T00:00:00Z' });
  });

  test('a review started recently, or a review of the final head, silences it', () => {
    add();
    addPr(db, 'GEO-9001', 'widgets#12', 'z-delivery');
    finalPr(db, 'widgets#12', 'abc1234', 'z-delivery');
    atMin(31);
    reviewStarted(db, 'widgets#12', 'z-delivery');
    expect(findAlerts(db, alive(), new Map(), new Date(base + 40 * 60_000))).toEqual([]);
    reviewedPr(db, 'widgets#12', 'abc1234', { recheck: false, force: false }, 'z-delivery');
    expect(findAlerts(db, alive(), new Map(), new Date(base + 200 * 60_000))).toEqual([]);
  });

  test('a short final sha and a full reviewed sha of the same commit count as reviewed', () => {
    add();
    addPr(db, 'GEO-9001', 'widgets#12', 'z-delivery');
    finalPr(db, 'widgets#12', 'abc1234', 'z-delivery');
    reviewedPr(db, 'widgets#12', 'abc1234def5678abc1234def5678abc1234def56', { recheck: false, force: false }, 'z-delivery');
    expect(findAlerts(db, alive(), new Map(), new Date(base + 31 * 60_000))).toEqual([]);
    // the marker read again (short) does not reset the final time
    finalPr(db, 'widgets#12', 'abc1234def', 'z-delivery');
    expect(findAlerts(db, alive(), new Map(), new Date(base + 31 * 60_000))).toEqual([]);
  });

  test('a blocked run does not flag its unreviewed final PR', () => {
    add();
    addPr(db, 'GEO-9001', 'widgets#12', 'z-delivery');
    finalPr(db, 'widgets#12', 'abc1234', 'z-delivery');
    setState(db, 'GEO-9001', 'blocked', { waitsOn: 'a gadgets release' }, 'z-delivery');
    expect(findAlerts(db, alive(), new Map(), new Date(base + 31 * 60_000))).toEqual([]);
    setState(db, 'GEO-9001', 'working', {}, 'z-delivery');
    expect(findAlerts(db, alive(), new Map(), new Date(base + 31 * 60_000))).toHaveLength(1);
  });

  test('a head that moves after the review is flagged as moved', () => {
    add();
    addPr(db, 'GEO-9001', 'widgets#12', 'z-delivery');
    reviewedPr(db, 'widgets#12', 'abc1234', { recheck: false, force: false }, 'z-delivery');
    finalPr(db, 'widgets#12', 'def5678', 'z-delivery');
    expect(findAlerts(db, alive(), new Map(), new Date(base + 31 * 60_000))[0]!.line).toContain('head moved since your review at abc1234');
  });

  test('an exited session whose PR is final and reviewed at its head is not flagged (asleep until its merge window)', () => {
    add();
    const gone = [{ id: S1, name: 'kettle', alive: false, state: 'exited' }];
    addPr(db, 'GEO-9001', 'widgets#12', 'z-delivery');
    expect(findAlerts(db, gone, new Map(), new Date(base))[0]!.line).toContain('has exited'); // a PR, not yet final
    finalPr(db, 'widgets#12', 'abc1234', 'z-delivery');
    expect(findAlerts(db, gone, new Map(), new Date(base))[0]!.line).toContain('has exited'); // final, not reviewed
    reviewedPr(db, 'widgets#12', 'abc1234', { recheck: false, force: false }, 'z-delivery');
    expect(findAlerts(db, gone, new Map(), new Date(base))).toEqual([]);
    finalPr(db, 'widgets#12', 'def5678', 'z-delivery'); // the head moved after the review
    expect(findAlerts(db, gone, new Map(), new Date(base)).map((a) => a.line).join('\n')).toContain('has exited');
  });

  test('an exited session, and a quiet one unless the owner chats with it', () => {
    add();
    expect(findAlerts(db, [{ id: S1, name: 'kettle', alive: false, state: 'exited' }], new Map(), new Date(base))[0]!.line).toContain('has exited');
    const quiet = new Map([[S1, base - 61 * 60_000]]);
    expect(findAlerts(db, alive('done'), quiet, new Date(base))[0]!.line).toContain('quiet for 61 min');
    expect(findAlerts(db, alive('running'), quiet, new Date(base))).toEqual([]);
    setGeoffChat(db, 'GEO-9001', true, 'z-delivery');
    expect(findAlerts(db, alive('needs_you'), quiet, new Date(base))).toEqual([]);
  });

  test('merged PRs and closed rows are never flagged', () => {
    add();
    addPr(db, 'GEO-9001', 'widgets#12', 'z-delivery');
    finalPr(db, 'widgets#12', 'abc1234', 'z-delivery');
    closePr(db, 'widgets#12', { to: 'merged', actor: 'z-delivery' });
    setState(db, 'GEO-9001', 'merged', { waitsOn: 'release' }, 'z-delivery');
    expect(findAlerts(db, alive('done'), new Map([[S1, 0]]), new Date(base + 500 * 60_000))).toEqual([]);
  });
});

describe('review fixes', () => {
  test('after a feed reset, notes in the new feed are kept, and old ones are not doubled', async () => {
    atc = fakeAtc(dir, [{ id: S1, name: 'kettle', alive: true, state: 'running' }]);
    add();
    const c = await AtcClient.open();
    try {
      await ingestNotes(db, c); // bootstrap at the end (empty)
      atc.feed.push({ at: base + 1000, session: S1, name: 'kettle', kind: 'note', detail: 'first note', label: 'progress' });
      expect((await ingestNotes(db, c)).notes).toBe(1);
      // The daemon's log resets: the old note is replayed at index 0, then a new one.
      atc.feed.length = 0;
      atc.feed.push({ at: base + 1000, session: S1, name: 'kettle', kind: 'note', detail: 'first note', label: 'progress' });
      atc.feed.push({ at: base + 5000, session: S1, name: 'kettle', kind: 'note', detail: 'second note', label: 'progress' });
      for (let i = 0; i < 3; i++) await ingestNotes(db, c); // three empty reads detect the reset
      await ingestNotes(db, c);
    } finally {
      c.close();
    }
    const texts = (db.query('SELECT text FROM run_notes ORDER BY id').all() as { text: string }[]).map((n) => n.text);
    expect(texts).toEqual(['first note', 'second note']);
  });

  test('an undelivered alert rides along with a new one', () => {
    add();
    add('GEO-9002', S2);
    addPr(db, 'GEO-9001', 'widgets#12', 'z-delivery');
    finalPr(db, 'widgets#12', 'abc1234', 'z-delivery');
    const alive = [
      { id: S1, name: 'kettle', alive: true, state: 'running' },
      { id: S2, name: 'toaster', alive: true, state: 'running' },
    ];
    atMin(31);
    sweep(db, findAlerts(db, alive, new Map(), new Date(base + 31 * 60_000)), 'hq-lanes'); // A queued, never delivered
    atMin(36);
    const gone = [alive[0]!, { ...alive[1]!, alive: false, state: 'exited' }];
    const r = sweep(db, findAlerts(db, gone, new Map(), new Date(base + 36 * 60_000)), 'hq-lanes');
    expect(r.sent.map((a) => a.key).sort()).toEqual(['pr:widgets#12', `session:${S2}`]);
    const msgs = outbox();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.text).toContain('widgets#12');
    expect(msgs[0]!.text).toContain('has exited');
  });

  test("a note about another repo's PR never marks this row's PR final", () => {
    add();
    addPr(db, 'GEO-9001', 'widgets#12', 'z-delivery');
    expect(applyNoteSignals(db, 'GEO-9001', 'gadgets#99 is final at abc1234', 'test').final).toBeNull();
    expect(listRuns(db)[0]!.prs[0]!.final_sha).toBeNull();
  });
});

describe('re-check fixes', () => {
  test('reset recovery reads the whole new feed from its oldest event', async () => {
    atc = fakeAtc(dir, [{ id: S1, name: 'kettle', alive: true, state: 'running' }]);
    add();
    for (let i = 0; i < 201; i++) atc.feed.push({ at: base + i * 1000, session: S1, name: 'kettle', kind: 'note', detail: `note ${i}`, label: 'progress' });
    db.query(`INSERT INTO meta (key, value) VALUES ('atc_events_cursor', 'not-a-cursor')`).run();
    const c = await AtcClient.open();
    try {
      expect((await ingestNotes(db, c)).reset).toBe(true);
      await ingestNotes(db, c);
    } finally {
      c.close();
    }
    expect((db.query('SELECT COUNT(*) AS n FROM run_notes').get() as { n: number }).n).toBe(201);
  });

  test('a phrase in a note that names a foreign PR marks nothing', () => {
    add();
    addPr(db, 'GEO-9001', 'widgets#12', 'z-delivery');
    addPr(db, 'GEO-9001', 'widgets#13', 'z-delivery');
    expect(applyNoteSignals(db, 'GEO-9001', 'Rebased widgets#12. gadgets#99 is final at abc1234', 'test').final).toBeNull();
    expect(listRuns(db)[0]!.prs.every((p) => p.final_sha === null)).toBe(true);
    expect(applyNoteSignals(db, 'GEO-9001', 'widgets#13 is final at abc1234', 'test').final).toBe('widgets#13');
  });

  test('two identical notes in the same second stay two', async () => {
    atc = fakeAtc(dir, [{ id: S1, name: 'kettle', alive: true, state: 'running' }]);
    add();
    const c = await AtcClient.open();
    try {
      await ingestNotes(db, c);
      atc.feed.push({ at: base + 100, session: S1, name: 'kettle', kind: 'note', detail: 'tick', label: 'progress' });
      atc.feed.push({ at: base + 900, session: S1, name: 'kettle', kind: 'note', detail: 'tick', label: 'progress' });
      expect((await ingestNotes(db, c)).notes).toBe(2);
    } finally {
      c.close();
    }
  });
});

describe('helper sessions', () => {
  test('a helper joins beside the main session; both are watched and swept', () => {
    add();
    setSession(db, 'GEO-9001', S2, 'z-delivery', 'add');
    expect(watchlist(db).map((w) => w.session_id).sort()).toEqual([S1, S2].sort());
    const gone = [
      { id: S1, name: 'kettle', alive: true, state: 'running' },
      { id: S2, name: 'helper', alive: false, state: 'exited' },
    ];
    expect(findAlerts(db, gone, new Map(), new Date(base))[0]!.line).toContain('helper session bbbbbbbb has exited');
  });

  test('a relaunch replaces the main session and keeps the helper', () => {
    add();
    setSession(db, 'GEO-9001', S2, 'z-delivery', 'add');
    const S3 = 'cccccccc-3333-4333-8333-333333333333';
    setSession(db, 'GEO-9001', S3, 'z-delivery');
    expect(watchlist(db).map((w) => w.session_id).sort()).toEqual([S2, S3].sort());
  });

  test('remove stops watching a helper; an unknown one is refused', () => {
    add();
    setSession(db, 'GEO-9001', S2, 'z-delivery', 'add');
    setSession(db, 'GEO-9001', 'bbbbbbbb', 'z-delivery', 'remove');
    expect(watchlist(db).map((w) => w.session_id)).toEqual([S1]);
    expect(() => setSession(db, 'GEO-9001', 'bbbbbbbb', 'z-delivery', 'remove')).toThrow('no active session');
  });
});

test('--add on the current main session keeps it main', () => {
  add();
  setSession(db, 'GEO-9001', S1, 'z-delivery', 'add');
  expect(listRuns(db)[0]!.sessions.find((x) => x.session_id === S1)).toMatchObject({ active: 1, helper: 0 });
});

describe('session ids', () => {
  const list = async () => [{ id: S1 }, { id: S2 }, { id: 'aaaaaaaa-9999-4999-8999-999999999999' }];
  test('a full id passes without atc; a unique prefix expands; others are refused', async () => {
    const boom = async (): Promise<{ id: string }[]> => {
      throw new Error('no daemon');
    };
    expect(await fullSessionId(boom, S2.toUpperCase())).toBe(S2);
    expect(await fullSessionId(list, 'bbbbbbbb')).toBe(S2);
    await expect(fullSessionId(list, 'aaaaaaaa')).rejects.toThrow('2 sessions start with aaaaaaaa');
    await expect(fullSessionId(list, 'cccccccc')).rejects.toThrow('no atc session starts with cccccccc');
    await expect(fullSessionId(boom, 'bbbbbbbb')).rejects.toThrow('give the full id');
    await expect(fullSessionId(list, 'kettle')).rejects.toThrow('must be an atc session id');
  });
});

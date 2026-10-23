import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { isShipPassDue as dueForShipPass } from '../src/releases/is-ship-pass-due.ts';
import { parseReleases } from '../src/releases/parse-releases.ts';
import { shipRuns } from '../src/releases/ship-runs.ts';
import { shippedText } from '../src/releases/shipped-text.ts';
import type { RunResult, Runner } from '../src/runner/types.ts';
import { addPr } from '../src/runs/add-pr.ts';
import { addRun } from '../src/runs/add-run.ts';
import { closePr } from '../src/runs/close-pr.ts';
import { getRun } from '../src/runs/get-run.ts';
import { setLiveCheck } from '../src/runs/set-live-check.ts';
import { setState } from '../src/runs/set-state.ts';
import { overrideEnv } from '../src/config/override-env.ts';
import { NOON_SYDNEY, at, freshDb } from './helpers.ts';

let db: Database;
let cleanup: () => void;

const sha = (n: number) => n.toString(16).padStart(40, '0');
const out = (stdout: string): RunResult => ({ code: 0, stdout, stderr: '' });
const rel = (tag: string, published_at: string, extra: Record<string, unknown> = {}) => ({ tag_name: tag, draft: false, prerelease: false, published_at, ...extra });

interface World {
  releases: Record<string, unknown>; // repo -> releases payload
  shas: Record<string, string>; // repo#n -> merge sha
  contains: Record<string, string[]>; // tag -> merge shas it contains
  cloud?: unknown;
}

// A fake gh: records every call.
function gh(w: World, calls: string[] = []): Runner {
  return async (cmd) => {
    const line = cmd.join(' ');
    calls.push(line);
    const releases = /^gh api repos\/zgeoff\/([\w-]+)\/releases\?per_page=30/.exec(line);
    if (releases) return w.releases[releases[1]!] === undefined ? { code: 1, stdout: '', stderr: 'invented 404' } : out(JSON.stringify(w.releases[releases[1]!]));
    if (/git\/ref\/tags\/deployed\/prod/.test(line)) return out(JSON.stringify(w.cloud ?? { object: { sha: sha(999) } }));
    const view = /^gh pr view (\d+) -R zgeoff\/([\w-]+) --json mergeCommit$/.exec(line);
    if (view) {
      const s = w.shas[`${view[2]}#${view[1]}`];
      return s ? out(JSON.stringify({ mergeCommit: { oid: s } })) : { code: 1, stdout: '', stderr: 'invented no PR' };
    }
    const cmp = /^gh api repos\/zgeoff\/[\w-]+\/compare\/([0-9a-f]{40})\.\.\.(\S+) --jq \.status$/.exec(line);
    if (cmp) return out(`${(w.contains[decodeURIComponent(cmp[2]!)] ?? []).includes(cmp[1]!) ? 'ahead' : 'behind'}\n`);
    return { code: 1, stdout: '', stderr: `unexpected ${line}` };
  };
}

// A run on `issue` in state `state` with one merged PR per ref.
function mergedRun(issue: string, refs: string[], state: 'merged' | 'deploying' | 'deploy-held' = 'merged') {
  addRun(db, { issue, title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' });
  for (const ref of refs) {
    addPr(db, issue, ref, 'z-delivery');
    closePr(db, ref, { to: 'merged', actor: 'z-delivery' });
  }
  setState(db, issue, state, {}, 'z-delivery');
}

const msgs = () => db.query('SELECT target, text, topic FROM outbox ORDER BY id').all() as { target: string; text: string; topic: string }[];
const prRow = (ref: string) => db.query('SELECT merge_sha, shipped_tag, shipped_at FROM run_prs WHERE ref = ?').get(ref) as { merge_sha: string | null; shipped_tag: string | null; shipped_at: string | null };
const T = new Date(NOON_SYDNEY);

beforeEach(() => {
  const fresh = freshDb();
  const restoreLiveCheckTo = overrideEnv('HQ_LIVECHECK_TO', undefined);
  db = fresh.db;
  cleanup = () => {
    restoreLiveCheckTo();
    fresh.cleanup();
  };
  at(NOON_SYDNEY);
});
afterEach(() => cleanup());

const world = (over: Partial<World> = {}): World => ({
  releases: over.releases ?? {},
  shas: over.shas ?? {},
  contains: over.contains ?? {},
  cloud: over.cloud,
});

test('a run moves to live-check when its merged PR is in a release', async () => {
  mergedRun('GEO-12', ['nixie#5']);
  const w = world({ releases: { nixie: [rel('v1.2.0', '2026-10-16T00:00:00Z')] }, shas: { 'nixie#5': sha(5) }, contains: { 'v1.2.0': [sha(5)] } });
  const r = await shipRuns(db, gh(w), T);
  expect(r.moved).toEqual([{ issue: 'GEO-12', to: 'live-check', prs: [{ ref: 'nixie#5', tag: 'v1.2.0', shipped_at: '2026-10-16T00:00:00Z' }] }]);
  const run = getRun(db, 'GEO-12')!;
  expect(run.state).toBe('live-check');
  expect(run.waits_on).toBeNull();
  expect(prRow('nixie#5')).toEqual({ merge_sha: sha(5), shipped_tag: 'v1.2.0', shipped_at: '2026-10-16T00:00:00Z' });
  const ev = db.query("SELECT actor, data, from_state, to_state FROM events WHERE subject_id = 'GEO-12' AND action = 'shipped'").get() as { actor: string; data: string; from_state: string; to_state: string };
  expect(ev).toMatchObject({ actor: 'hq-releases', from_state: 'merged', to_state: 'live-check' });
  expect(JSON.parse(ev.data).prs).toEqual([{ ref: 'nixie#5', tag: 'v1.2.0', shipped_at: '2026-10-16T00:00:00Z' }]);
});

test('with --check none the run goes to done and closes', async () => {
  mergedRun('GEO-13', ['nixie#6'], 'deploy-held');
  setLiveCheck(db, 'GEO-13', 'none', 'z-delivery');
  const w = world({ releases: { nixie: [rel('v1.2.0', '2026-10-16T00:00:00Z')] }, shas: { 'nixie#6': sha(6) }, contains: { 'v1.2.0': [sha(6)] } });
  await shipRuns(db, gh(w), T);
  const run = getRun(db, 'GEO-13')!;
  expect(run.state).toBe('done');
  expect(run.closed_at).not.toBeNull();
  expect(run.live_check).toBe('none');
});

test('state --check and run check set live_check and log it; bad values are refused', () => {
  mergedRun('GEO-14', ['nixie#7']);
  setState(db, 'GEO-14', 'deploying', { liveCheck: 'none' }, 'z-delivery');
  expect(getRun(db, 'GEO-14')!.live_check).toBe('none');
  setLiveCheck(db, 'GEO-14', 'owed', 'z-delivery');
  expect(getRun(db, 'GEO-14')!.live_check).toBe('owed');
  expect(db.query("SELECT COUNT(*) AS n FROM events WHERE subject_id = 'GEO-14' AND action = 'check'").get()).toEqual({ n: 1 });
  expect(() => setLiveCheck(db, 'GEO-14', 'maybe', 'z-delivery')).toThrow('owed or none');
  expect(() => setState(db, 'GEO-14', 'deploying', { liveCheck: 'maybe' as 'owed' }, 'z-delivery')).toThrow('owed or none');
});

test('an open PR, no containing release, or a repo with no source leaves the run alone', async () => {
  mergedRun('GEO-1', ['nixie#5']);
  addPr(db, 'GEO-1', 'nixie#9', 'z-delivery'); // still open
  mergedRun('GEO-2', ['nixie#6']);
  mergedRun('GEO-3', ['dotfiles#1']);
  const w = world({ releases: { nixie: [rel('v1.2.0', '2026-10-16T00:00:00Z')], dotfiles: [rel('v1.0.0', '2026-10-16T00:00:00Z')] }, shas: { 'nixie#5': sha(5), 'nixie#6': sha(6), 'dotfiles#1': sha(1) }, contains: { 'v1.2.0': [sha(5)], 'v1.0.0': [sha(1)] } });
  const calls: string[] = [];
  const r = await shipRuns(db, gh(w, calls), T);
  expect(r.moved).toEqual([]);
  expect(['GEO-1', 'GEO-2', 'GEO-3'].map((i) => getRun(db, i)!.state)).toEqual(['merged', 'merged', 'merged']);
  expect(calls.some((c) => c.includes('dotfiles'))).toBe(false);
  expect(prRow('nixie#6').shipped_tag).toBeNull();
});

test('a closed-unmerged PR is ignored, but one merged PR is required', async () => {
  addRun(db, { issue: 'GEO-4', title: 'Invented kettle work', place: 'imp', session: null, next: 'x', gate: null, geoffChat: false, actor: 'z-delivery' });
  addPr(db, 'GEO-4', 'nixie#5', 'z-delivery');
  closePr(db, 'nixie#5', { to: 'closed', actor: 'z-delivery' });
  setState(db, 'GEO-4', 'merged', {}, 'z-delivery');
  const w = world({ releases: { nixie: [rel('v1.0.0', '2026-10-16T00:00:00Z')] }, shas: { 'nixie#5': sha(5) }, contains: { 'v1.0.0': [sha(5)] } });
  expect((await shipRuns(db, gh(w), T)).moved).toEqual([]);
  addPr(db, 'GEO-4', 'nixie#6', 'z-delivery');
  closePr(db, 'nixie#6', { to: 'merged', actor: 'z-delivery' });
  w.shas['nixie#6'] = sha(6);
  w.contains['v1.0.0'] = [sha(6)];
  expect((await shipRuns(db, gh(w), T)).moved.map((m) => m.issue)).toEqual(['GEO-4']);
});

test('draft and prerelease releases are ignored', async () => {
  mergedRun('GEO-5', ['nixie#5']);
  const w = world({
    releases: { nixie: [rel('v2.0.0', '2026-10-16T00:00:00Z', { prerelease: true }), rel('v2.1.0', '2026-10-16T01:00:00Z', { draft: true, published_at: null }), rel('v0.9.0', '2026-10-10T00:00:00Z')] },
    shas: { 'nixie#5': sha(5) },
    contains: { 'v2.0.0': [sha(5)], 'v2.1.0': [sha(5)] },
  });
  expect((await shipRuns(db, gh(w), T)).moved).toEqual([]);
  w.releases['nixie'] = [rel('v2.2.0', '2026-10-17T00:00:00Z'), rel('v2.0.0', '2026-10-16T00:00:00Z', { prerelease: true }), rel('v2.1.0', '2026-10-16T01:00:00Z', { draft: true, published_at: null }), rel('v0.9.0', '2026-10-10T00:00:00Z')];
  w.contains['v2.2.0'] = [sha(5)];
  const second = await shipRuns(db, gh(w), T);
  expect(second.moved.map((move) => move.prs[0]?.tag)).toEqual(['v2.2.0']);
});

test('the oldest containing release is recorded, found by halving the release list', async () => {
  mergedRun('GEO-6', ['nixie#5']);
  const w = world({
    releases: { nixie: [rel('v1.3.0', '2026-10-16T00:00:00Z'), rel('v1.2.0', '2026-10-15T00:00:00Z'), rel('v1.1.0', '2026-10-14T00:00:00Z'), rel('v1.0.0', '2026-10-13T00:00:00Z')] },
    shas: { 'nixie#5': sha(5) },
    contains: { 'v1.3.0': [sha(5)], 'v1.2.0': [sha(5)] },
  });
  const calls: string[] = [];
  const r = await shipRuns(db, gh(w, calls), T);
  expect(r.moved[0]!.prs[0]).toEqual({ ref: 'nixie#5', tag: 'v1.2.0', shipped_at: '2026-10-15T00:00:00Z' });
  expect(calls.filter((call) => call.includes('/compare/'))).toStrictEqual([
    `gh api repos/zgeoff/nixie/compare/${sha(5)}...v1.1.0 --jq .status`,
    `gh api repos/zgeoff/nixie/compare/${sha(5)}...v1.2.0 --jq .status`,
  ]);
  expect(r.compares).toBe(2);
});

test('only releases with the repo tag pattern count', async () => {
  mergedRun('GEO-7', ['atc#3']);
  mergedRun('GEO-8', ['auto-mode#4']);
  const w = world({
    releases: { atc: [rel('@zgeoff/atc@1.0.0', '2026-10-15T00:00:00Z'), rel('@zgeoff/other@9.0.0', '2026-10-16T00:00:00Z')], 'auto-mode': [rel('auto-mode-v0.4.0', '2026-10-15T00:00:00Z'), rel('v9.9.9', '2026-10-16T00:00:00Z')] },
    shas: { 'atc#3': sha(3), 'auto-mode#4': sha(4) },
    contains: { '@zgeoff/atc@1.0.0': [sha(3)], '@zgeoff/other@9.0.0': [sha(3)], 'auto-mode-v0.4.0': [sha(4)], 'v9.9.9': [sha(4)] },
  });
  const r = await shipRuns(db, gh(w), T);
  expect(r.moved.map((m) => `${m.issue} ${m.prs[0]!.tag}`).sort()).toEqual(['GEO-7 @zgeoff/atc@1.0.0', 'GEO-8 auto-mode-v0.4.0']);
});

test('blocked, working, live-check and done runs are untouched', async () => {
  mergedRun('GEO-20', ['nixie#5']);
  setState(db, 'GEO-20', 'blocked', {}, 'z-delivery');
  mergedRun('GEO-21', ['nixie#6']);
  setState(db, 'GEO-21', 'working', {}, 'z-delivery');
  mergedRun('GEO-22', ['nixie#7']);
  setState(db, 'GEO-22', 'live-check', {}, 'z-delivery');
  const w = world({ releases: { nixie: [rel('v1.0.0', '2026-10-16T00:00:00Z')] }, shas: { 'nixie#5': sha(5), 'nixie#6': sha(6), 'nixie#7': sha(7) }, contains: { 'v1.0.0': [sha(5), sha(6), sha(7)] } });
  const calls: string[] = [];
  const r = await shipRuns(db, gh(w, calls), T);
  expect(r.moved).toEqual([]);
  expect(calls).toEqual([]);
  expect(['GEO-20', 'GEO-21', 'GEO-22'].map((i) => getRun(db, i)!.state)).toEqual(['blocked', 'working', 'live-check']);
});

test('a run waits until every merged PR has shipped', async () => {
  mergedRun('GEO-23', ['nixie#5', 'impz#2']);
  const w = world({ releases: { nixie: [rel('v1.0.0', '2026-10-16T00:00:00Z')], impz: [rel('v0.1.0', '2026-10-16T00:00:00Z')] }, shas: { 'nixie#5': sha(5), 'impz#2': sha(2) }, contains: { 'v1.0.0': [sha(5)] } });
  expect((await shipRuns(db, gh(w), T)).moved).toEqual([]);
  expect(prRow('nixie#5').shipped_tag).toBe('v1.0.0'); // remembered
  w.releases['impz'] = [rel('v0.2.0', '2026-10-17T00:00:00Z'), rel('v0.1.0', '2026-10-16T00:00:00Z')];
  w.contains['v0.2.0'] = [sha(2)];
  const calls: string[] = [];
  const r = await shipRuns(db, gh(w, calls), T);
  expect(r.moved.map((m) => m.issue)).toEqual(['GEO-23']);
  expect(prRow('impz#2').shipped_tag).toBe('v0.2.0');
  expect(calls.filter((c) => c.includes('nixie') && c.includes('compare'))).toEqual([]);
});

test('the compare cap leaves the rest for the next pass', async () => {
  const w = world({ releases: { nixie: [rel('v1.0.0', '2026-10-16T00:00:00Z')] }, shas: {}, contains: { 'v1.0.0': [] } });
  for (let i = 1; i <= 62; i++) {
    mergedRun(`GEO-${100 + i}`, [`nixie#${i}`]);
    w.shas[`nixie#${i}`] = sha(i);
    w.contains['v1.0.0']!.push(sha(i));
  }
  const r = await shipRuns(db, gh(w), T);
  expect(r.compares).toBe(60);
  expect(r.moved).toHaveLength(60);
  expect(r.deferred).toBe(2);
  const r2 = await shipRuns(db, gh(w), T);
  expect(r2.moved).toHaveLength(2);
  expect(r2.deferred).toBe(0);
});

test('a pass the compare cap cut off resumes: the next pass asks only what it has no answer to', async () => {
  const scene = world({ releases: { nixie: [rel('v1.0.0', '2026-10-16T00:00:00Z')] }, shas: {}, contains: { 'v1.0.0': [] } });
  for (let index = 1; index <= 61; index++) {
    mergedRun(`GEO-${300 + index}`, [`nixie#${index}`]);
    scene.shas[`nixie#${index}`] = sha(index);
  }
  const first = await shipRuns(db, gh(scene), T);
  const second = await shipRuns(db, gh(scene), T);
  expect([first.compares, first.deferred]).toEqual([60, 1]);
  expect([second.compares, second.deferred]).toEqual([1, 0]);
});

test('runs that have not shipped cannot hold back the rest: the next pass starts where the last ran out', async () => {
  const w = world({ releases: { nixie: [rel('v1.0.0', '2026-10-16T00:00:00Z')] }, shas: {}, contains: { 'v1.0.0': [] } });
  for (let i = 1; i <= 62; i++) {
    mergedRun(`GEO-${100 + i}`, [`nixie#${i}`]);
    w.shas[`nixie#${i}`] = sha(i);
    if (i > 60) w.contains['v1.0.0']!.push(sha(i)); // only the last two have shipped
  }
  const r = await shipRuns(db, gh(w), T);
  expect([r.compares, r.moved.length, r.deferred]).toEqual([60, 0, 2]);
  const r2 = await shipRuns(db, gh(w), T);
  expect(r2.moved.map((m) => m.issue)).toEqual(['GEO-161', 'GEO-162']);
});

test('the merge sha is cached: a second pass makes no pr view call', async () => {
  mergedRun('GEO-30', ['nixie#5']);
  const w = world({ releases: { nixie: [rel('v1.0.0', '2026-10-16T00:00:00Z')] }, shas: { 'nixie#5': sha(5) }, contains: {} });
  const calls: string[] = [];
  await shipRuns(db, gh(w, calls), T);
  expect(calls.filter((c) => c.startsWith('gh pr view'))).toHaveLength(1);
  expect(prRow('nixie#5').merge_sha).toBe(sha(5));
  calls.length = 0;
  await shipRuns(db, gh(w, calls), T);
  expect(calls.filter((c) => c.startsWith('gh pr view'))).toHaveLength(0);
});

test('a merge commit that is not 40 hex characters is refused', async () => {
  mergedRun('GEO-31', ['nixie#5']);
  const w = world({ releases: { nixie: [rel('v1.0.0', '2026-10-16T00:00:00Z')] }, shas: { 'nixie#5': 'abc123' } });
  const r = await shipRuns(db, gh(w), T);
  expect(r.moved).toEqual([]);
  expect(r.errors[0]).toContain('nixie#5');
  expect(prRow('nixie#5').merge_sha).toBeNull();
});

test('live-check runs go to z-qa alone, done runs to z-delivery only', async () => {
  mergedRun('GEO-12', ['nixie#5']);
  mergedRun('GEO-13', ['nixie#6']);
  setLiveCheck(db, 'GEO-13', 'none', 'z-delivery');
  const w = world({ releases: { nixie: [rel('v1.2.0', '2026-10-16T00:00:00Z')] }, shas: { 'nixie#5': sha(5), 'nixie#6': sha(6) }, contains: { 'v1.2.0': [sha(5), sha(6)] } });
  await shipRuns(db, gh(w), T);
  const m = msgs();
  expect(m.map((x) => x.target).sort()).toEqual(['z-delivery', 'z-qa']);
  expect(m.find((x) => x.target === 'z-qa')!.text).toBe('Shipped, now live-check: GEO-12 (nixie#5 in v1.2.0). Run the live check, then hq run done GEO-12.');
  expect(m.find((x) => x.target === 'z-delivery')!.text).toBe('Shipped and closed (no check owed): GEO-13 (nixie#6 in v1.2.0).');
  expect(m[0]!.topic).toStartWith('run-shipped');
});

test('only done runs: z-delivery alone is told', async () => {
  mergedRun('GEO-13', ['nixie#6']);
  setLiveCheck(db, 'GEO-13', 'none', 'z-delivery');
  const w = world({ releases: { nixie: [rel('v1.2.0', '2026-10-16T00:00:00Z')] }, shas: { 'nixie#6': sha(6) }, contains: { 'v1.2.0': [sha(6)] } });
  await shipRuns(db, gh(w), T);
  expect(msgs().map((x) => x.target)).toEqual(['z-delivery']);
});

test('HQ_LIVECHECK_TO sets who hears about live checks; z-delivery still hears about done runs', async () => {
  overrideEnv('HQ_LIVECHECK_TO', 'z-qa');
  mergedRun('GEO-12', ['nixie#5']);
  mergedRun('GEO-13', ['nixie#6']);
  setLiveCheck(db, 'GEO-13', 'none', 'z-delivery');
  const w = world({ releases: { nixie: [rel('v1.2.0', '2026-10-16T00:00:00Z')] }, shas: { 'nixie#5': sha(5), 'nixie#6': sha(6) }, contains: { 'v1.2.0': [sha(5), sha(6)] } });
  await shipRuns(db, gh(w), T);
  const m = msgs();
  expect(m.find((x) => x.target === 'z-qa')!.text).not.toContain('GEO-13');
  expect(m.find((x) => x.target === 'z-delivery')!.text).not.toContain('GEO-12');
  expect(m.find((x) => x.target === 'z-delivery')!.text).toContain('GEO-13');
});

test('the message lists at most 20 runs and stays under 2000 characters', () => {
  const mv = (i: number) => ({ issue: `GEO-${i}`, to: 'live-check' as const, prs: [{ ref: `nixie#${i}`, tag: 'v1.2.0', shipped_at: NOON_SYDNEY }] });
  const text = shippedText(Array.from({ length: 25 }, (_, i) => mv(i + 1)), []);
  expect(text).toContain('GEO-20 (');
  expect(text).not.toContain('GEO-21 (');
  expect(text).toContain('and 5 more');
  expect(text.length).toBeLessThan(2000);
});

test('a bad releases payload moves nothing and records an error', async () => {
  mergedRun('GEO-40', ['nixie#5']);
  for (const bad of [{ not: 'a list' }, [{ tag_name: 'v1 bad name', draft: false, prerelease: false, published_at: '2026-10-16T00:00:00Z' }], [{ tag_name: 'v1.0.0', draft: false }], [{ tag_name: 'v1.0.0', draft: false, prerelease: false, published_at: 'soon' }], [null]]) {
    const w = world({ releases: { nixie: bad }, shas: { 'nixie#5': sha(5) }, contains: { 'v1.0.0': [sha(5)] } });
    const r = await shipRuns(db, gh(w), T);
    expect(r.moved).toEqual([]);
    expect(r.errors[0]).toStartWith('nixie:');
    expect(getRun(db, 'GEO-40')!.state).toBe('merged');
  }
  expect(db.query("SELECT COUNT(*) AS n FROM events WHERE action = 'error' AND subject_id = 'releases'").get()).toEqual({ n: 5 }); // logged when the error changes
  // The failing repo does not stop another one.
  mergedRun('GEO-41', ['impz#1']);
  const w = world({ releases: { nixie: 'junk', impz: [rel('v0.1.0', '2026-10-16T00:00:00Z')] }, shas: { 'nixie#5': sha(5), 'impz#1': sha(1) }, contains: { 'v0.1.0': [sha(1)] } });
  const r = await shipRuns(db, gh(w), T);
  expect(r.moved.map((m) => m.issue)).toEqual(['GEO-41']);
  expect(r.errors).toHaveLength(1);
  // A bad cloud ref is refused too.
  mergedRun('GEO-42', ['cloud#1']);
  const r2 = await shipRuns(db, gh(world({ cloud: { object: { sha: 'nope' } }, shas: { 'cloud#1': sha(1) } })), T);
  expect(r2.errors.some((e) => e.startsWith('cloud:'))).toBe(true);
  expect(getRun(db, 'GEO-42')!.state).toBe('merged');
});

test('a dry run writes nothing', async () => {
  mergedRun('GEO-50', ['nixie#5']);
  const w = world({ releases: { nixie: [rel('v1.0.0', '2026-10-16T00:00:00Z')] }, shas: { 'nixie#5': sha(5) }, contains: { 'v1.0.0': [sha(5)] } });
  const before = db.query('SELECT COUNT(*) AS n FROM events').get();
  const r = await shipRuns(db, gh(w), T, { dryRun: true });
  expect(r.moved.map((m) => m.issue)).toEqual(['GEO-50']);
  expect(getRun(db, 'GEO-50')!.state).toBe('merged');
  expect(prRow('nixie#5')).toEqual({ merge_sha: null, shipped_tag: null, shipped_at: null });
  expect(db.query('SELECT COUNT(*) AS n FROM events').get()).toEqual(before);
  expect(msgs()).toEqual([]);
});

test('a run that changed while GitHub was asked is left alone', async () => {
  mergedRun('GEO-60', ['nixie#5']);
  const w = world({ releases: { nixie: [rel('v1.0.0', '2026-10-16T00:00:00Z')] }, shas: { 'nixie#5': sha(5) }, contains: { 'v1.0.0': [sha(5)] } });
  const inner = gh(w);
  const run: Runner = async (cmd) => {
    if (cmd.includes('--jq') && cmd.join(' ').includes('/compare/')) setState(db, 'GEO-60', 'blocked', {}, 'z-delivery');
    return inner(cmd);
  };
  expect((await shipRuns(db, run, T)).moved).toEqual([]);
  expect(getRun(db, 'GEO-60')!.state).toBe('blocked');
});

test('the pass is due every 10 minutes', () => {
  expect(dueForShipPass(db, T)).toBe(true);
  db.query("INSERT INTO meta (key, value) VALUES ('releases_checked_at', ?)").run(NOON_SYDNEY);
  expect(dueForShipPass(db, new Date(T.getTime() + 9 * 60_000))).toBe(false);
  expect(dueForShipPass(db, new Date(T.getTime() + 10 * 60_000))).toBe(true);
});

test('parseReleases sorts newest first and skips other tags', () => {
  const l = parseReleases([rel('v1.0.0', '2026-10-10T00:00:00Z'), rel('v1.1.0', '2026-10-12T00:00:00Z'), rel('nightly', '2026-10-13T00:00:00Z')], /^v\d/);
  expect(l.map((x) => x.tag)).toEqual(['v1.1.0', 'v1.0.0']);
});

test('a live check set to owed while GitHub was asked is honoured', async () => {
  mergedRun('GEO-61', ['nixie#5']);
  setLiveCheck(db, 'GEO-61', 'none', 'z-delivery');
  const w = world({ releases: { nixie: [rel('v1.0.0', '2026-10-16T00:00:00Z')] }, shas: { 'nixie#5': sha(5) }, contains: { 'v1.0.0': [sha(5)] } });
  const inner = gh(w);
  const run: Runner = async (cmd) => {
    if (cmd.join(' ').includes('/compare/')) setLiveCheck(db, 'GEO-61', 'owed', 'z-delivery');
    return inner(cmd);
  };
  expect((await shipRuns(db, run, T)).moved.map((m) => m.to)).toEqual(['live-check']);
  expect(getRun(db, 'GEO-61')!.state).toBe('live-check');
});

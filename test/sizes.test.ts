import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { addPr } from '../src/runs/add-pr.ts';
import { addRun } from '../src/runs/add-run.ts';
import { closePr } from '../src/runs/close-pr.ts';
import { getRun } from '../src/runs/get-run.ts';
import { setState } from '../src/runs/set-state.ts';
import type { RunOpts } from '../src/runner/types.ts';
import { bandOf } from '../src/sizes/band-of.ts';
import { mergedRuns } from '../src/sizes/merged-runs.ts';
import { parseSize } from '../src/sizes/parse-size.ts';
import { prFacts } from '../src/sizes/pr-facts.ts';
import { setSize } from '../src/sizes/set-size.ts';
import { sizeStats } from '../src/sizes/size-stats.ts';
import { sizeText } from '../src/sizes/size-text.ts';
import { at, freshDb } from './helpers.ts';

let db: Database;
let cleanup: () => void;
const T0 = '2026-10-16T01:00:00Z'; // after the stats cutoff
const atMin = (m: number) => at(new Date(Date.parse(T0) + m * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z'));

beforeEach(() => {
  ({ db, cleanup } = freshDb());
  atMin(0);
});
afterEach(() => cleanup());

const run = (issue: string, size: ReturnType<typeof parseSize> = null) =>
  addRun(db, { issue, title: 'Invented teapot work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, size, actor: 'z-delivery' });
const merge = (issue: string, ...refs: string[]) => {
  for (const r of refs) {
    addPr(db, issue, r, 'z-delivery');
    closePr(db, r, { to: 'merged', actor: 'z-delivery' });
  }
  setState(db, issue, 'merged', {}, 'z-delivery');
};

// A fake gh that answers the GraphQL queries from a table of PRs; null marks a PR GitHub doesn't
// know. `heads` are the branches some PR was opened from.
type Fake = { additions: number; deletions: number; base?: string; was?: string[] } | null;
function fakeGh(prs: Record<string, Fake>, calls: string[][] = [], heads: string[] = []) {
  return async (cmd: string[], _o?: RunOpts) => {
    calls.push(cmd);
    const q = cmd.at(-1)!;
    const data: Record<string, unknown> = {};
    let missing = false;
    for (const m of q.matchAll(/(p\d+): repository\(owner: "([\w.-]+)", name: "([\w.-]+)"\) \{ pullRequest\(number: (\d+)\)/g)) {
      const pr = prs[`${m[3]}#${m[4]}`];
      if (!pr) {
        missing = true;
        data[m[1]!] = null;
        continue;
      }
      data[m[1]!] = {
        pullRequest: {
          additions: pr.additions,
          deletions: pr.deletions,
          baseRefName: pr.base ?? 'main',
          repository: { defaultBranchRef: { name: 'main' } },
          timelineItems: { nodes: (pr.was ?? []).map((b) => ({ previousRefName: b })) },
        },
      };
    }
    for (const m of q.matchAll(/(b\d+): repository\(owner: "[\w.-]+", name: "[\w.-]+"\) \{ pullRequests\(headRefName: ("[^"]*")/g)) {
      data[m[1]!] = { pullRequests: { totalCount: heads.includes(JSON.parse(m[2]!) as string) ? 1 : 0 } };
    }
    return { code: missing ? 1 : 0, stdout: JSON.stringify({ data, ...(missing ? { errors: [{ message: 'not found' }] } : {}) }), stderr: '' };
  };
}

test('bands are [low, high); a guess must sit in its band, with both flags or neither', () => {
  expect([499, 500, 1999, 2000, 4999, 5000].map(bandOf)).toEqual(['S', 'M', 'M', 'L', 'L', 'XL']);
  expect(parseSize('l', '3,000')).toEqual({ size: 'L', lines: 3000 });
  expect(parseSize(undefined, undefined)).toBeNull();
  expect(() => parseSize('L', undefined)).toThrow('go together');
  expect(() => parseSize('M', '3000')).toThrow('3000 lines is L, not M');
  expect(() => parseSize('XXL', '9000')).toThrow('--size must be');
  expect(() => parseSize('S', '0')).toThrow('whole number');
});

test('a size comes with run add or later with run size, and the change is logged', () => {
  run('GEO-1', parseSize('L', '3000'));
  expect(getRun(db, 'GEO-1')).toMatchObject({ size: 'L', size_lines: 3000 });
  run('GEO-2');
  setSize(db, 'GEO-2', { size: 'S', lines: 200 }, 'z-triage');
  expect(getRun(db, 'GEO-2')).toMatchObject({ size: 'S', size_lines: 200 });
  const ev = db.query(`SELECT actor, from_state, to_state FROM events WHERE action = 'sized'`).get();
  expect(ev).toEqual({ actor: 'z-triage', from_state: null, to_state: 'S' });
  expect(() => setSize(db, 'GEO-404', { size: 'S', lines: 1 }, 'z-triage')).toThrow('no run GEO-404');
});

test('guess against actual by band, unsized runs apart, and the share that shipped as a stack', async () => {
  run('GEO-1', parseSize('L', '3000'));
  merge('GEO-1', 'kettle#1', 'kettle#2'); // a stack: #2 was based on #1's branch, then retargeted
  run('GEO-2', parseSize('S', '300'));
  merge('GEO-2', 'kettle#3'); // 900 lines: outside S
  run('GEO-3');
  merge('GEO-3', 'teapot#4'); // unsized, still counted for stacks
  run('GEO-4', parseSize('M', '1000'));
  addPr(db, 'GEO-4', 'kettle#5', 'z-delivery'); // open: not a merged run
  run('GEO-5', parseSize('M', '1000'));
  merge('GEO-5', 'kettle#6');
  addPr(db, 'GEO-5', 'kettle#7', 'z-delivery'); // half merged: left out until the rest merges
  atMin(60);
  const runs = mergedRuns(db, T0, '2026-10-17T00:00:00Z');
  expect(runs.map((r) => r.issue)).toEqual(['GEO-1', 'GEO-2', 'GEO-3']);
  const gh = fakeGh(
    {
      'kettle#1': { additions: 1500, deletions: 500 },
      'kettle#2': { additions: 1000, deletions: 0, was: ['geo-1-part-1'] },
      'kettle#3': { additions: 800, deletions: 100, was: ['release/1.0'] }, // a release branch: no PR came from it
      'teapot#4': { additions: 50, deletions: 50, base: 'release/1.0' },
    },
    [],
    ['geo-1-part-1'],
  );
  const facts = (await prFacts(db, gh, runs.flatMap((r) => r.prs)))!;
  expect(facts['kettle#2']).toEqual({ lines: 1000, stacked: true });
  expect(facts['kettle#3']!.stacked).toBe(false);
  expect(facts['teapot#4']!.stacked).toBe(false);
  const s = sizeStats(runs, facts);
  expect(s).toMatchObject({ runs: 3, unsized: 1, unread: 0, stacked: 1 });
  expect(s.stackShare).toBeCloseTo(1 / 3);
  expect(s.byBand.L).toMatchObject({ n: 1, medianRatio: 1, medianActual: 3000, outside: 0, thin: true });
  expect(s.byBand.S).toMatchObject({ n: 1, medianRatio: 3, outside: 1 });
  const text = sizeText(s).join('\n');
  expect(text).toContain('S : actual/guess median 3.00×, median actual 900 lines, outside the band 1 of 1');
  expect(text).toContain('widest misses: GEO-2 S 300 → 900 (M)');
  expect(text).toContain('shipped as a stack (a PR based on another PR\'s branch): 1 of 3, 33%');
});

test('merged PR facts are cached; a PR GitHub lacks is left out, and gh failing gives null', async () => {
  run('GEO-1', parseSize('M', '1000'));
  merge('GEO-1', 'kettle#1', 'zgeoff/teapot#9');
  const runs = mergedRuns(db, T0, '2026-10-17T00:00:00Z');
  const calls: string[][] = [];
  const gh = fakeGh({ 'kettle#1': { additions: 10, deletions: 0, base: 'geo-0-part' }, 'teapot#9': null }, calls, ['geo-0-part']);
  const facts = (await prFacts(db, gh, runs[0]!.prs))!;
  expect(facts).toEqual({ 'kettle#1': { lines: 10, stacked: true } });
  expect(sizeStats(runs, facts)).toMatchObject({ unread: 1, stackShare: null });
  await prFacts(db, gh, runs[0]!.prs);
  expect(calls).toHaveLength(3); // PRs, then kettle#1's base; then only teapot#9 again
  expect(calls[2]!.at(-1)).not.toContain('name: "kettle"');
  const broken = async () => ({ code: 1, stdout: '', stderr: 'gh: not logged in' });
  expect(await prFacts(db, broken, [{ ref: 'kettle#7', url: null }])).toBeNull();
  expect(sizeText(null).join('\n')).toContain('needs GitHub');
  // A branch lookup GitHub doesn't answer leaves the PR unread and uncached, not "no stack".
  const half = async (cmd: string[]) => {
    if (cmd.at(-1)!.includes('b0:')) return { code: 1, stdout: JSON.stringify({ data: { b0: null, b1: { pullRequests: { totalCount: 0 } } } }), stderr: '' };
    return fakeGh({ 'kettle#8': { additions: 5, deletions: 0, base: 'geo-8-part' }, 'kettle#9': { additions: 5, deletions: 0, base: 'release/2.0' } })(cmd);
  };
  const two = [{ ref: 'kettle#8', url: null }, { ref: 'kettle#9', url: null }];
  expect(await prFacts(db, half, two)).toEqual({ 'kettle#9': { lines: 5, stacked: false } });
  expect(Object.keys(JSON.parse((db.query(`SELECT value FROM meta WHERE key = 'stats_pr_facts_v2'`).get() as { value: string }).value))).not.toContain('kettle#8');
});

test('a run whose last merge falls outside the window, or a dropped or unfinished run, is left out', () => {
  run('GEO-1', parseSize('S', '100'));
  merge('GEO-1', 'kettle#1');
  expect(mergedRuns(db, '2026-10-16T02:00:00Z', '2026-10-17T00:00:00Z')).toHaveLength(0);
  expect(mergedRuns(db, T0, '2026-10-17T00:00:00Z')).toHaveLength(1);
  db.query(`UPDATE runs SET state = 'dropped' WHERE issue = 'GEO-1'`).run();
  expect(mergedRuns(db, T0, '2026-10-17T00:00:00Z')).toHaveLength(0);
});

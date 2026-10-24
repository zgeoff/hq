import { afterEach, beforeEach, expect, test } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from '../src/cli.ts';
import { HELP } from '../src/help.ts';
import { VERSION } from '../src/version.ts';
import { compareSemver } from '../src/capabilities/compare-semver.ts';
import { SHAPES } from '../src/capabilities/shapes.ts';
import { COMMANDS } from '../src/commands.ts';
import { SCHEMA_VERSION } from '../src/db/schema-version.ts';
import { setMeta } from '../src/db/set-meta.ts';
import { runReview } from '../src/noslop/run-review.ts';
import { runPRCommand } from '../src/pr-status/run-pr-command.ts';
import { review } from '../src/review/review.ts';
import type { RunOpts, Runner } from '../src/runner/types.ts';
import { rolesByName } from '../src/roles/roles-by-name.ts';
import { ASK_TRANSITIONS } from '../src/transitions/ask-transitions.ts';
import { PR_TRANSITIONS } from '../src/transitions/pr-transitions.ts';
import { RUN_TRANSITIONS } from '../src/transitions/run-transitions.ts';
import { NOON_SYDNEY, at, fakeAtc, freshDb } from './helpers.ts';
import { FAKE_FULL_SHA, FAKE_TOKEN, buildFakeRunner } from './noslop-fake.ts';

let db: ReturnType<typeof freshDb>['db'];
let dir: string;
let cleanup: () => void;
let out: string[];
const origErr = console.error,
  origLog = console.log,
  saved = { notify: process.env['HQ_NOTIFY'], as: process.env['HQ_AS'], db: process.env['HQ_DB'] },
  savedReview = ['HQ_NOSLOP_OP_SETTINGS', 'REVIEW_DIR', 'HQ_PROJECTS', 'HQ_REPOS'].map((k) => [k, process.env[k]] as const);

beforeEach(() => {
  ({ db, dir, cleanup } = freshDb());
  at(NOON_SYDNEY);
  process.env['HQ_NOTIFY'] = 'off';
  process.env['HQ_AS'] = 'z-stu';
  out = [];
  console.log = (s: string) => out.push(s);
  console.error = (s: string) => out.push(s);
});
afterEach(() => {
  console.log = origLog;
  console.error = origErr;
  for (const [k, v] of [['HQ_NOTIFY', saved.notify], ['HQ_AS', saved.as], ['HQ_DB', saved.db]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  // The noslop review test sets these.
  for (const [k, v] of savedReview) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  cleanup();
});

const hq = async (...argv: string[]) => {
  out = [];
  const code = await main([...argv, '--json']);
  return { code, json: JSON.parse(out.join('\n')) };
};

test('--json gives the version, schema, commands, transitions, roles and shapes', async () => {
  const { code, json } = await hq('capabilities');
  expect(code).toBe(0);
  expect(json.ok).toBe(true);
  expect(Object.keys(json).sort()).toEqual(['commands', 'ok', 'roles', 'schema', 'shapes', 'transitions', 'version']);
  expect(json.version).toBe(VERSION);
  expect(json.schema).toBe(SCHEMA_VERSION);
  expect(json.shapes).toEqual(SHAPES);
  expect(json.roles).toEqual(rolesByName());
});

test('commands are the registry rows, data only', async () => {
  const { json } = await hq('capabilities');
  expect(json.commands).toHaveLength(COMMANDS.length);
  expect(json.commands.map((c: { usage: string }) => c.usage)).toEqual(COMMANDS.map((c) => c.usage));
  for (const [i, c] of COMMANDS.entries()) {
    expect(json.commands[i]).toEqual({ nouns: c.nouns, verbs: c.verbs, bare: c.bare, usage: c.usage, summary: c.summary, section: c.section, readOnly: c.readOnly });
  }
  const self = json.commands.find((c: { nouns: string[] }) => c.nouns.includes('capabilities'));
  expect(self.readOnly).toBe(true);
});

test('transitions are the exported tables', async () => {
  const { json } = await hq('capabilities');
  expect(json.transitions).toEqual(JSON.parse(JSON.stringify({ ask: ASK_TRANSITIONS, run: RUN_TRANSITIONS, pr: PR_TRANSITIONS })));
});

test('text mode is a short summary', async () => {
  out = [];
  expect(await main(['capabilities'])).toBe(0);
  const text = out.join('\n');
  expect(text).toContain(`hq ${VERSION} (schema v${SCHEMA_VERSION})`);
  expect(text).toContain(`${COMMANDS.length} commands (${COMMANDS.filter((c) => c.readOnly).length} read-only)`);
  for (const name of Object.keys(SHAPES)) expect(text).toContain(name);
});

test('help lists capabilities', () => {
  expect(HELP).toContain('  hq capabilities [--json] [--require X.Y.Z]');
});

test('--require: older fails with too_old, equal and newer pass, bad input is bad_args', async () => {
  const older = await hq('capabilities', '--require', '99.0.0');
  expect(older.code).toBe(1);
  expect(older.json).toEqual({ ok: false, error: { code: 'too_old', message: `hq ${VERSION} is older than 99.0.0: run bun run install-bin in ~/projects/hq` } });
  expect((await hq('capabilities', '--require', VERSION)).code).toBe(0);
  expect((await hq('capabilities', '--require', '0.1.0')).json.version).toBe(VERSION);
  for (const bad of ['1.2', 'v1.2.3', '1.2.3-rc1', 'latest', '']) {
    const r = await hq('capabilities', '--require', bad);
    expect(r.code, bad).toBe(1);
    expect(r.json.error.code, bad).toBe('bad_args');
  }
});

test('semver compares by number, not text', () => {
  expect(compareSemver('0.10.0', '0.9.9')).toBeGreaterThan(0);
  expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
  expect(compareSemver('0.33.9', '0.34.0')).toBeLessThan(0);
  expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0);
});

test('package.json carries the same version as VERSION', () => {
  const pkg = JSON.parse(readFileSync(join(import.meta.dir, '../package.json'), 'utf8')) as { version: string };
  expect(pkg.version).toBe(VERSION);
});

test('capabilities does not open the db; a command that does would', async () => {
  const gone = join(dir, 'missing', 'hq.db');
  process.env['HQ_DB'] = gone;
  expect((await hq('capabilities')).code).toBe(0);
  expect((await hq('version')).code).toBe(0);
  expect(existsSync(join(dir, 'missing'))).toBe(false);
  // The control: a command that opens the db creates it there.
  expect((await hq('status')).code).toBe(0);
  expect(existsSync(gone)).toBe(true);
});

// Each listed key must be in the real output: `a.b` a nested key, `a[].b` the key on every element
// of the array `a`. A required `a[]` must not be empty, so each test seeds a row; an optional `a[]?`
// may be absent, null or empty.
function missing(value: unknown, path: string): string | null {
  const [head, ...tail] = path.split('.');
  const rest = tail.join('.');
  const optional = head!.endsWith('?');
  const bare = optional ? head!.slice(0, -1) : head!;
  const isArray = bare.endsWith('[]');
  const key = isArray ? bare.slice(0, -2) : bare;
  if (value === null || typeof value !== 'object' || !(key in (value as object))) return optional ? null : `${key} is missing`;
  const next = (value as Record<string, unknown>)[key];
  if (optional && next === null) return null;
  if (!isArray) return rest ? missing(next, rest) : null;
  if (!Array.isArray(next)) {
    return `${key}[] is empty or not an array`;
  }
  if (next.length === 0) {
    return optional ? null : `${key}[] is empty or not an array`;
  }
  for (const el of next) {
    const m = rest ? missing(el, rest) : null;
    if (m) return m;
  }
  return null;
}

function checkShape(name: string, actual: unknown): void {
  for (const k of SHAPES[name]!.keys) expect(missing(actual, k), `${name}: ${k}`).toBeNull();
}

test('shape: status', async () => {
  const status = await hq('status');
  const keys = SHAPES['status']?.keys ?? [];

  expect(keys).not.toHaveLength(0);
  expect(keys.flatMap((key) => missing(status.json, key) ?? [])).toStrictEqual([]);
});

test('shape: fleet', async () => {
  setMeta(db, 'fleet_last', JSON.stringify({ at: '2026-10-14T01:00:00Z', dryRun: false, steps: [{ name: 'z-kettle', action: 'ok', detail: 'invented', id: 'id-kettle' }] }));
  const fleet = await hq('fleet');
  const keys = SHAPES['fleet']?.keys ?? [];

  expect(keys).not.toHaveLength(0);
  expect(keys.flatMap((key) => missing(fleet.json, key) ?? [])).toStrictEqual([]);
});

test('shape: fleet shows promptCheck for a declared session that is live in atc, and says so in the text', async () => {
  const atc = fakeAtc(dir); // z-stu is live; the fake gives no prompt, so the check is unknown
  try {
    // --json skips the check (the compaction hook reads it under a 5 s limit) unless --prompts asks.
    expect(((await hq('fleet')).json as { declared: { promptCheck?: object }[] }).declared.every((e) => e.promptCheck === undefined)).toBe(true);
    const json = (await hq('fleet', '--prompts')).json as { declared: { name: string; prompt: string; promptCheck?: object }[] };
    const stu = json.declared.find((e) => e.name === 'z-stu')!;
    expect(typeof stu.prompt).toBe('string');
    expect(stu.promptCheck).toEqual({ state: 'unknown', since: null, hint: null, reason: expect.stringContaining('no prompt') });
    expect(json.declared.some((e) => e.promptCheck === undefined)).toBe(true); // not live: no check
    checkShape('fleet', json);
    out = [];
    expect(await main(['fleet'])).toBe(0);
    expect(out.join('\n')).toContain('z-stu: prompt check unknown (atc gave no prompt for the session)');
  } finally {
    atc.stop();
    delete process.env['HQ_ATC_SOCKET'];
  }
});

interface FleetPluginJson {
  declared: { name: string; pluginCheck?: object }[];
}

// The fake lists z-stu with no plugin folders, as atc before 4.15 spawned it.
test("shape: fleet --prompts gives pluginCheck for a live session whose plugin folders differ from fleet.json's", async () => {
  const atc = fakeAtc(dir);
  try {
    const ran = await hq('fleet', '--prompts');
    expect((ran.json as FleetPluginJson).declared.filter((e) => e.pluginCheck !== undefined)).toEqual([expect.objectContaining({ name: 'z-stu', pluginCheck: { declared: ['~/projects/hq/mods/hq-band'], running: [] } })]);
    checkShape('fleet', ran.json);
  } finally {
    atc.stop();
    delete process.env['HQ_ATC_SOCKET'];
  }
});

test("hq fleet's text names a live session whose plugin folders differ from fleet.json's", async () => {
  const atc = fakeAtc(dir);
  try {
    const code = await main(['fleet']);
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('z-stu: plugin folders differ: declared ~/projects/hq/mods/hq-band, running none — a respawn loads the declared ones');
  } finally {
    atc.stop();
    delete process.env['HQ_ATC_SOCKET'];
  }
});

test('shape: fleet before the first ensure has no last', async () => {
  const json = (await hq('fleet')).json as { last?: unknown };
  expect(json.last ?? null).toBeNull();
  checkShape('fleet', json);
});

test('shape: fleet with a waiting step that has no id', async () => {
  setMeta(db, 'fleet_last', JSON.stringify({ at: '2026-10-14T01:00:00Z', dryRun: false, steps: [{ name: 'z-kettle', action: 'waiting', detail: 'invented' }] }));
  const json = (await hq('fleet')).json as { last: { steps: { id?: string }[] } };
  expect(json.last.steps[0]!.id).toBeUndefined();
  checkShape('fleet', json);
});

test('shape: run list and run show', async () => {
  await hq('run', 'add', 'GEO-9', '--title', 'Invented kettle work', '--where', 'none');
  checkShape('run list', (await hq('run', 'list')).json);
  checkShape('run show', (await hq('run', 'show', 'GEO-9')).json);
});

test('shape: call list and proposal list', async () => {
  for (const kind of ['call', 'proposal']) {
    await hq(kind, 'add', `geo-1-${kind}`, '--title', 'Paint', '--question', 'Green?', '--body', 'Invented.', '--issues', 'GEO-1');
  }
  checkShape('call list', (await hq('call', 'list')).json);
  checkShape('proposal list', (await hq('proposal', 'list')).json);
});

// `hq review` takes no runner (it uses the real gh and codex, so it needs the network), so this runs
// review() with fakes. The command's data is `{ ...result }` plus `ok`, so the keys are the same.
test('shape: review', async () => {
  process.env['REVIEW_DIR'] = join(dir, 'reviews');
  process.env['HQ_PROJECTS'] = join(dir, 'projects');
  process.env['HQ_REPOS'] = join(dir, 'repos');
  process.env['CODEX_HOME'] = join(dir, 'codex');
  const run: Runner = async (cmd: string[], opts?: RunOpts) => {
    const line = cmd.join(' ');
    if (line === 'git remote get-url origin') return { code: 0, stdout: 'git@github.com:zgeoff/widgets.git\n', stderr: '' };
    if (line === 'git diff --name-only origin/main...HEAD') return { code: 0, stdout: 'src/kettle.ts\n', stderr: '' };
    if (line === 'git diff origin/main...HEAD') return { code: 0, stdout: '+++ b/src/kettle.ts\n+  boil();\n', stderr: '' };
    if (line.includes('--json headRefName,headRefOid,baseRefName')) {
      return { code: 0, stdout: '{"headRefName":"feat","headRefOid":"a1b2c3d4e5f60718293a4b5c6d7e8f9012345678","baseRefName":"main"}', stderr: '' };
    }
    if (line === 'git rev-parse FETCH_HEAD') {
      return { code: 0, stdout: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678\n', stderr: '' };
    }
    if (cmd[0] === 'codex' && opts?.stdoutFile) await Bun.write(opts.stdoutFile, 'No findings.\n');
    if (line.includes('--json name,state,bucket')) return { code: 0, stdout: '[{"name":"test","state":"SUCCESS","bucket":"pass"}]', stderr: '' };
    if (cmd[1] === 'api') return { code: 0, stdout: '0\n', stderr: '' };
    return { code: 0, stdout: '', stderr: '' };
  };
  try {
    const r = await review(run, 'widgets', 7, { watch: false });
    checkShape('review', { ok: true, ...r });
  } finally {
    for (const k of ['REVIEW_DIR', 'HQ_PROJECTS', 'HQ_REPOS', 'CODEX_HOME']) delete process.env[k];
  }
});

// `hq pr` reads the head with the real gh, so a record is written and read with runPRCommand and
// a fake runner. The command's data is `{ pr }` plus `ok`, so the keys are the same.
test('it gives every pr status shape key, in the answer output and the status output of a PR with a record', async () => {
  const fake = buildFakeRunner({ prHead: { code: 0, stdout: JSON.stringify({ headRefOid: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }), stderr: '' } }),
    recorded = await runPRCommand({ run: fake.run, db, verb: 'answer', rest: ['widgets', '7', 'lgtm'], flags: { source: 'chat:kettle-12' }, actor: () => Promise.resolve('z-kettle'), readOwnerSession: () => Promise.resolve({ verdict: 'owner' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) }),
    status = await runPRCommand({ run: fake.run, db, verb: 'status', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-kettle'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  checkShape('pr status', { ok: true, ...recorded.data });
  checkShape('pr status', { ok: true, ...status.data });
  expect(status.data).toMatchObject({ pr: { repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', answer: 'lgtm', answerSource: 'chat:kettle-12' } });
});

test('it gives the pr status shape for a PR with no record', async () => {
  const shown = await hq('pr', 'status', 'widgets', '9');

  checkShape('pr status', shown.json);
});

// A noslop PR's review is runReview() with the fake noslop runner: a --fixes-only run, so fixChecks
// is not empty and the keys under it are checked. The command's data is `{ ...result }` plus `ok`.
test('shape: review (noslop)', async () => {
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: FAKE_TOKEN } }));
  process.env['HQ_NOSLOP_OP_SETTINGS'] = join(dir, 'settings.json');
  process.env['REVIEW_DIR'] = join(dir, 'reviews');
  process.env['HQ_PROJECTS'] = join(dir, 'projects');
  process.env['HQ_REPOS'] = join(dir, 'repos');
  setMeta(db, 'noslop', JSON.stringify({ repos: ['widgets'], sha: FAKE_FULL_SHA }));
  db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, depth, special, findings, redesign, sha) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, 'aaaa000000000000000000000000000000000001', 'standard', 'none', ?, NULL, 'x')").run('[{"id":"kettle0000000001","lens":"correctness","severity":"high","title":"Kettle never boils"}]');
  const fake = buildFakeRunner({
      git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'cccc000000000000000000000000000000000002\n', stderr: '' } },
      reviewComments: [JSON.stringify({ id: 1, in_reply_to_id: null, body: 'Kettle never boils\n<!-- noslop:finding {"id":"kettle0000000001"} -->' }), JSON.stringify({ id: 2, in_reply_to_id: 1, body: 'fixed cccc000' })].join('\n'),
      noslopReview: {
        code: 0,
        stdout: JSON.stringify({ version: 7, head: 'feat', base: 'main', depth: 'standard', findings: [], failedCalls: [], notReviewed: [], notReviewedByLens: [], fixChecks: [{ findingID: 'kettle0000000001', fixed: true, reason: 'the kettle boils now' }] }),
        stderr: '',
      },
    }),
    r = await runReview({ run: fake.run, db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true });

  expect(r).toMatchObject({ engine: 'noslop', fixesOnly: true, fixChecks: [{ findingID: 'kettle0000000001', fixed: true, reason: 'the kettle boils now', title: 'Kettle never boils' }] });
  checkShape('review (noslop)', { ok: true, ...r });
});

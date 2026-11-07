import { afterEach, beforeEach, expect, test } from 'bun:test';
import { isRecord } from '@zgeoff/std';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { z } from 'zod';
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
import { findPath } from '../src/test-utils/find-path.ts';
import { PR_TRANSITIONS } from '../src/transitions/pr-transitions.ts';
import { RUN_TRANSITIONS } from '../src/transitions/run-transitions.ts';
import { NOON_SYDNEY, at, fakeAtc, freshDb } from './helpers.ts';
import { FAKE_FULL_SHA, FAKE_TOKEN, buildFakeRunner } from './noslop-fake.ts';

let db: ReturnType<typeof freshDb>['db'];
let dir: string;
let cleanup: () => void;
let out: string[];
beforeEach(() => {
  ({ db, dir, cleanup } = freshDb());
  const removeFreshDb = cleanup;
  const originalError = console.error;
  const originalLog = console.log;

  // The noslop review test sets the last four.
  const savedEnv = ['HQ_NOTIFY', 'HQ_AS', 'HQ_DB', 'HQ_NOSLOP_OP_SETTINGS', 'REVIEW_DIR', 'HQ_PROJECTS', 'HQ_REPOS'].map((name) => [name, process.env[name]] as const);
  cleanup = () => {
    console.log = originalLog;
    console.error = originalError;
    for (const [name, value] of savedEnv) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    removeFreshDb();
  };
  at(NOON_SYDNEY);
  process.env['HQ_NOTIFY'] = 'off';
  process.env['HQ_AS'] = 'z-stu';
  out = [];
  console.log = (s: string) => out.push(s);
  console.error = (s: string) => out.push(s);
});
afterEach(() => {
  cleanup();
});

const hq = async (...argv: string[]) => {
  out = [];
  const code = await main([...argv, '--json']);
  const json: unknown = JSON.parse(out.join('\n'));
  return { code, json };
};

test('--json gives the version, schema, commands, transitions, roles and shapes', async () => {
  const { code, json } = await hq('capabilities');
  expect(code).toBe(0);
  expect(findPath(json, 'ok')).toBe(true);
  const keys = Object.keys(z.record(z.string(), z.unknown()).parse(json));
  expect(keys.toSorted()).toStrictEqual(['commands', 'ok', 'roles', 'schema', 'shapes', 'transitions', 'version']);
  expect(findPath(json, 'version')).toBe(VERSION);
  expect(findPath(json, 'schema')).toBe(SCHEMA_VERSION);
  expect(findPath(json, 'shapes')).toStrictEqual(SHAPES);
  expect(findPath(json, 'roles')).toStrictEqual(rolesByName());
});

test('commands are the registry rows, data only', async () => {
  const { json } = await hq('capabilities');
  const commandSchema = z.looseObject({ usage: z.string(), nouns: z.array(z.string()), readOnly: z.boolean() });
  const commands = z.array(commandSchema).parse(findPath(json, 'commands'));
  const expected = COMMANDS.map((command) => ({ nouns: command.nouns, verbs: command.verbs, bare: command.bare, usage: command.usage, summary: command.summary, section: command.section, readOnly: command.readOnly }));
  expect(findPath(json, 'commands')).toStrictEqual(expected);
  const self = commands.find((command) => command.nouns.includes('capabilities'));
  expect(self?.readOnly).toBe(true);
});

test('transitions are the exported tables', async () => {
  const { json } = await hq('capabilities');
  expect(findPath(json, 'transitions')).toStrictEqual(structuredClone({ ask: ASK_TRANSITIONS, run: RUN_TRANSITIONS, pr: PR_TRANSITIONS }));
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
  expect(older.json).toStrictEqual({ ok: false, error: { code: 'too_old', message: `hq ${VERSION} is older than 99.0.0: run bun run install-bin in ~/projects/hq` } });
  expect((await hq('capabilities', '--require', VERSION)).code).toBe(0);
  const newer = await hq('capabilities', '--require', '0.1.0');
  expect(findPath(newer.json, 'version')).toBe(VERSION);
  for (const bad of ['1.2', 'v1.2.3', '1.2.3-rc1', 'latest', '']) {
    const r = await hq('capabilities', '--require', bad);
    expect(r.code, bad).toBe(1);
    expect(findPath(r.json, 'error', 'code'), bad).toBe('bad_args');
  }
});

test('semver compares by number, not text', () => {
  expect(compareSemver('0.10.0', '0.9.9')).toBeGreaterThan(0);
  expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
  expect(compareSemver('0.33.9', '0.34.0')).toBeLessThan(0);
  expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0);
});

test('package.json carries the same version as VERSION', () => {
  const text = readFileSync(join(import.meta.dir, '../package.json'), 'utf8');
  const pkg = z.object({ version: z.string() }).parse(JSON.parse(text));
  expect(pkg.version).toBe(VERSION);
});

test('capabilities does not open the db; a command that does would', async () => {
  const gone = join(dir, 'missing', 'hq.db');
  process.env['HQ_DB'] = gone;
  expect((await hq('capabilities')).code).toBe(0);
  expect((await hq('version')).code).toBe(0);
  expect(existsSync(join(dir, 'missing'))).toBe(false);
  expect((await hq('status')).code).toBe(0);
  expect(existsSync(gone)).toBe(true);
});

function missing(value: unknown, path: string): string | null {
  const [head, ...tail] = path.split('.');
  const rest = tail.join('.');
  const optional = head!.endsWith('?');
  const bare = optional ? head!.slice(0, -1) : head!;
  const isArray = bare.endsWith('[]');
  const key = isArray ? bare.slice(0, -2) : bare;
  if (!isRecord(value) || !(key in value)) {
    return optional ? null : `${key} is missing`;
  }
  const next = value[key];
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
  const atc = fakeAtc(dir);
  try {
    const plain = await hq('fleet');
    const checkedSchema = z.object({ promptCheck: z.unknown().optional() });
    expect(z.object({ declared: z.array(checkedSchema) }).parse(plain.json).declared.every((entry) => entry.promptCheck === undefined)).toBe(true);
    const prompted = await hq('fleet', '--prompts');
    const entrySchema = z.object({ name: z.string(), prompt: z.string(), promptCheck: z.unknown().optional() });
    const json = z.object({ declared: z.array(entrySchema) }).parse(prompted.json);
    const stu = json.declared.find((e) => e.name === 'z-stu')!;
    expect(typeof stu.prompt).toBe('string');
    expect(stu.promptCheck).toEqual({ state: 'unknown', since: null, hint: null, reason: expect.stringContaining('no prompt') });
    expect(json.declared.some((entry) => entry.promptCheck === undefined)).toBe(true);
    checkShape('fleet', prompted.json);
    out = [];
    expect(await main(['fleet'])).toBe(0);
    expect(out.join('\n')).toContain('z-stu: prompt check unknown (atc gave no prompt for the session)');
  } finally {
    atc.stop();
    delete process.env['HQ_ATC_SOCKET'];
  }
});

test("shape: fleet --prompts gives pluginCheck for a live session whose plugin folders differ from fleet.json's", async () => {
  const atc = fakeAtc(dir);
  try {
    const ran = await hq('fleet', '--prompts');
    const entrySchema = z.object({ name: z.string(), pluginCheck: z.unknown().optional() });
    const withPlugins = z.object({ declared: z.array(entrySchema) }).parse(ran.json).declared.filter((entry) => entry.pluginCheck !== undefined);
    expect(withPlugins).toStrictEqual([{ name: 'z-stu', pluginCheck: { declared: ['~/projects/hq/mods/hq-band'], running: [] } }]);
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
  const fleet = await hq('fleet');
  expect(z.object({ last: z.unknown().optional() }).parse(fleet.json).last ?? null).toBeNull();
  checkShape('fleet', fleet.json);
});

test('shape: fleet with a waiting step that has no id', async () => {
  setMeta(db, 'fleet_last', JSON.stringify({ at: '2026-10-14T01:00:00Z', dryRun: false, steps: [{ name: 'z-kettle', action: 'waiting', detail: 'invented' }] }));
  const fleet = await hq('fleet');
  const stepSchema = z.object({ id: z.string().optional() });
  const [step] = z.object({ last: z.object({ steps: z.array(stepSchema) }) }).parse(fleet.json).last.steps;
  invariant(step);
  expect(step.id).toBeUndefined();
  checkShape('fleet', fleet.json);
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

// `hq review` takes no runner and uses the real gh and codex, so it needs the network.
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

// `hq pr` reads the head with the real gh.
test('it gives every pr status shape key, in the answer output and the status output of a PR with a record', async () => {
  const fake = buildFakeRunner({ prHead: { code: 0, stdout: JSON.stringify({ headRefOid: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }), stderr: '' } });
  const recorded = await runPRCommand({ run: fake.run, db, verb: 'answer', rest: ['widgets', '7', 'lgtm'], flags: { source: 'chat:kettle-12' }, actor: () => Promise.resolve('z-kettle'), readOwnerSession: () => Promise.resolve({ verdict: 'owner' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });
  const status = await runPRCommand({ run: fake.run, db, verb: 'status', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-kettle'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  checkShape('pr status', { ok: true, ...recorded.data });
  checkShape('pr status', { ok: true, ...status.data });
  expect(status.data).toMatchObject({ pr: { repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', answer: 'lgtm', answerSource: 'chat:kettle-12' } });
});

test('it gives the pr status shape for a PR with no record', async () => {
  const shown = await hq('pr', 'status', 'widgets', '9');

  checkShape('pr status', shown.json);
});

test('shape: review (noslop)', async () => {
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: FAKE_TOKEN } }));
  process.env['HQ_NOSLOP_OP_SETTINGS'] = join(dir, 'settings.json');
  process.env['REVIEW_DIR'] = join(dir, 'reviews');
  process.env['HQ_PROJECTS'] = join(dir, 'projects');
  process.env['HQ_REPOS'] = join(dir, 'repos');
  setMeta(db, 'noslop', JSON.stringify({ repos: ['widgets'], sha: FAKE_FULL_SHA }));
  db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, depth, special, findings, sha) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, 'aaaa000000000000000000000000000000000001', 'standard', 'none', ?, 'x')").run('[{"id":"kettle0000000001","lens":"correctness","severity":"high","title":"Kettle never boils"}]');
  const fake = buildFakeRunner({
      noslopReview: {
        code: 0,
        stdout: JSON.stringify({ version: 7, head: 'feat', base: 'main', depth: 'standard', findings: [], failedCalls: [], notReviewed: [], notReviewedByLens: [], fixChecks: [{ findingID: 'kettle0000000001', fixed: true, reason: 'the kettle boils now' }] }),
        stderr: '',
      },
    });
  const result = await runReview({ run: fake.run, db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true });

  expect(result).toMatchObject({ engine: 'noslop', fixesOnly: true, fixChecks: [{ findingID: 'kettle0000000001', fixed: true, reason: 'the kettle boils now', title: 'Kettle never boils' }] });
  checkShape('review (noslop)', { ok: true, ...result });
});

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli.ts';
import { overrideEnv } from '../src/config/override-env.ts';
import { checkFleetBuild } from '../src/roles/check-fleet-build.ts';
import { getDeclaredForwards as declaredForwards } from '../src/roles/get-declared-forwards.ts';
import { getDeclaredSessions as declaredSessions } from '../src/roles/get-declared-sessions.ts';
import { roleName } from '../src/roles/role-name.ts';
import { rolesByName } from '../src/roles/roles-by-name.ts';
import { ROLES } from '../src/roles/roles.ts';
import { validateRoles } from '../src/roles/validate-roles.ts';
import { withStaleBuild } from '../src/roles/with-stale-build.ts';
import { forwardOf } from '../src/outbox/forward-of.ts';
import { setForward } from '../src/outbox/set-forward.ts';
import { NOON_SYDNEY, at, freshDb } from './helpers.ts';

const one = (name: string, roles: string[], extra: Record<string, unknown> = {}) => ({ name, skill: 'kettle', cwd: 'defs', model: 'opus', wake: true, roles, ...extra });
const valid = () => ({
  sessions: [one('z-aa', ['owner']), one('z-bb', ['orchestrator']), one('z-cc', ['reviewer']), one('z-dd', ['qa', 'triage'])],
  forwards: { 'z-old': 'z-dd' },
});

test('the table loads and each single role resolves to one declared session', () => {
  expect(ROLES.sessions.length).toBeGreaterThan(5);
  const names = declaredSessions().map((s) => s.name);
  for (const r of ['owner', 'orchestrator', 'reviewer', 'qa'] as const) expect(names).toContain(roleName(r));
  expect(new Set(names).size).toBe(names.length);
  expect(names).toContain(declaredForwards()['z-refine']!);
});

test('a valid object passes', () => {
  expect(validateRoles(valid()).sessions).toHaveLength(4);
});

test('pluginDirs: a list of absolute or ~/ folders passes; anything else is refused by name', () => {
  const ok = valid();
  ok.sessions[0] = one('z-aa', ['owner'], { pluginDirs: ['~/plugins/band', '/opt/plugins/pane'] });
  expect(validateRoles(ok).sessions[0]).toMatchObject({ pluginDirs: ['~/plugins/band', '/opt/plugins/pane'] });
  expect(validateRoles(valid()).sessions[0]).not.toHaveProperty('pluginDirs');
  for (const bad of [[], ['plugins/band'], ['~/plugins/../band'], 'band', [7]]) {
    const t = valid();
    t.sessions[0] = one('z-aa', ['owner'], { pluginDirs: bad });
    expect(() => validateRoles(t)).toThrow('sessions[0].pluginDirs');
  }
});

test('the validator rejects a bad file and names the field', () => {
  const dup = valid();
  dup.sessions.push(one('z-aa', []));
  expect(() => validateRoles(dup)).toThrow('sessions[4].name');

  const unknown = valid();
  unknown.sessions[0]!.roles = ['owner', 'boss'];
  expect(() => validateRoles(unknown)).toThrow('unknown role');

  const two = valid();
  two.sessions[1]!.roles = ['orchestrator', 'owner'];
  expect(() => validateRoles(two)).toThrow('roles.owner');

  const none = valid();
  none.sessions[2]!.roles = [];
  expect(() => validateRoles(none)).toThrow('roles.reviewer');

  const fwd = valid();
  fwd.forwards = { 'z-old': 'z-nobody' };
  expect(() => validateRoles(fwd)).toThrow('forwards.z-old');

  const name = valid();
  name.sessions[0]!.name = 'Z-Aa';
  expect(() => validateRoles(name)).toThrow('sessions[0].name');

  const cwd = valid();
  (cwd.sessions[0] as Record<string, unknown>)['cwd'] = 'elsewhere';
  expect(() => validateRoles(cwd)).toThrow('sessions[0].cwd');

  const skill = valid();
  (skill.sessions[0] as Record<string, unknown>)['skill'] = null;
  expect(() => validateRoles(skill)).toThrow('sessions[0].prompt');
});

test('a declared forward needs no meta row, and a meta row wins', () => {
  const { db, cleanup } = freshDb();
  try {
    expect(forwardOf(db, 'z-refine')).toBe(declaredForwards()['z-refine']!);
    db.query(`INSERT INTO meta (key, value) VALUES ('outbox_forwards', ?)`).run(JSON.stringify({ 'z-refine': 'z-other' }));
    expect(forwardOf(db, 'z-refine')).toBe('z-other');
  } finally {
    cleanup();
  }
});

// Recursive, as GEO-1288 moves code into area folders; tests beside their modules are skipped, as
// they were in test/.
test('no session-name literal sits in src/ outside roles.ts', () => {
  const hits: string[] = [];
  for (const f of readdirSync(`${import.meta.dir}/../src`, { recursive: true, encoding: 'utf8' }).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts') && n !== 'roles.ts')) {
    const code = readFileSync(`${import.meta.dir}/../src/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const m of code.matchAll(/['"`]z-[a-z]+['"`]/g)) hits.push(`${f}: ${m[0]}`);
  }
  expect(hits).toEqual([]);
});

describe('hq fleet --json and forwards', () => {
let cleanup: () => void;
let db: ReturnType<typeof freshDb>['db'];
let out: string[];
const origLog = console.log,
  saved = { notify: process.env['HQ_NOTIFY'], as: process.env['HQ_AS'] };
beforeEach(() => {
  ({ cleanup, db } = freshDb());
  at(NOON_SYDNEY);
  process.env['HQ_NOTIFY'] = 'off';
  process.env['HQ_AS'] = roleName('owner');
  out = [];
  console.log = (s: string) => out.push(s);
});
afterEach(() => {
  console.log = origLog;
  for (const [k, v] of [['HQ_NOTIFY', saved.notify], ['HQ_AS', saved.as]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  cleanup();
});

test('a forward declared in fleet.json cannot be removed by command; a stored one can', () => {
  const [from] = Object.keys(declaredForwards());
  expect(() => setForward(db, from!, null)).toThrow('declared in fleet.json');
  setForward(db, 'z-gone', roleName('qa'));
  setForward(db, 'z-gone', null);
  expect(forwardOf(db, 'z-gone')).toBe('z-gone');
});

test('removing a stored override refuses when the declared forward it brings back makes a loop', () => {
  const [from] = Object.keys(declaredForwards());
  const declaredTo = declaredForwards()[from!]!;
  setForward(db, from!, roleName('qa'));
  setForward(db, declaredTo, from!);
  expect(() => setForward(db, from!, null)).toThrow('makes a loop');
  expect(forwardOf(db, declaredTo)).toBe(roleName('qa'));
  setForward(db, declaredTo, null);
  setForward(db, from!, null);
  expect(forwardOf(db, from!)).toBe(declaredTo);
});

test('a retired role holder is left out of the roles', () => {
  const r = rolesByName([roleName('reviewer')]);
  expect(r.reviewer).toBeNull();
  expect(r.owner).toBe(roleName('owner'));
});

test('hq fleet --json carries the stale-build warning when the checkout fleet.json differs', async () => {
  const changed = JSON.parse(readFileSync(join(import.meta.dir, '../fleet.json'), 'utf8')) as { forwards: Record<string, string> },
    dir = mkdtempSync(join(tmpdir(), 'hq-fleet-projects-')),
    restore = overrideEnv('HQ_PROJECTS', dir);
  try {
    changed.forwards['z-kettle'] = 'z-q';
    mkdirSync(join(dir, 'hq'));
    writeFileSync(join(dir, 'hq', 'fleet.json'), JSON.stringify(changed));
    const code = await main(['fleet', '--json']);
    expect(code).toBe(0);
    expect(JSON.parse(out.join('\n')).staleBuild).toContain(`older fleet.json than ${dir}/hq/fleet.json`);
  } finally {
    restore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('hq fleet --json gives each session its skill and roles, plus the roles and forwards', async () => {
  expect(await main(['fleet', '--json'])).toBe(0);
  const j = JSON.parse(out.join('\n'));
  const q = j.declared.find((e: { name: string }) => e.name === 'z-q');
  expect(q.skill).toBeNull();
  expect(q.roles).toEqual(['developer']);
  const owner = j.declared.find((e: { name: string }) => e.name === roleName('owner'));
  expect(owner.skill).toBe('intake');
  expect(owner.roles).toEqual(['owner']);
  expect(owner.cwd).toBeTruthy();
  expect(j.roles).toEqual(rolesByName());
  expect(j.roles.reviewer).toBe(roleName('reviewer'));
  expect(j.roles.developer).toEqual(['z-q']);
  expect(j.forwards['z-refine']).toBe(declaredForwards()['z-refine']);
  // z-steward's compact hook (.claude/hooks/print-skill.sh) reads these: tell z-steward before changing them.
  for (const e of j.declared) expect(Object.keys(e)).toEqual(expect.arrayContaining(['name', 'skill']));
  expect('last' in j).toBe(true);
});
});

test('the stale-build check is quiet when the checkout fleet.json matches the build, or is missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hq-fleet-build-'));
  try {
    writeFileSync(join(dir, 'fleet.json'), readFileSync(join(import.meta.dir, '../fleet.json'), 'utf8'));
    expect(checkFleetBuild(join(dir, 'fleet.json'))).toBeNull();
    expect(checkFleetBuild(join(dir, 'none.json'))).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the stale-build check warns when the checkout fleet.json differs from the build', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hq-fleet-build-'));
  try {
    const changed = JSON.parse(readFileSync(join(import.meta.dir, '../fleet.json'), 'utf8')) as { sessions: { model: string }[] },
      path = join(dir, 'fleet.json');
    for (const s of changed.sessions) {
      s.model = 'kettle-model';
    }
    writeFileSync(path, JSON.stringify(changed));
    expect(checkFleetBuild(path)).toContain('bun run install-bin');
    expect(withStaleBuild({ data: { timer: 'active' }, text: 'timer: active' }, checkFleetBuild(path))).toStrictEqual({
      data: { timer: 'active', staleBuild: expect.stringContaining('older fleet.json') },
      text: expect.stringMatching(/^WARNING: the installed hq carries an older fleet\.json .*\ntimer: active$/su),
    });
    expect(withStaleBuild({ data: { timer: 'active' }, text: 'timer: active' }, null)).toStrictEqual({ data: { timer: 'active' }, text: 'timer: active' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


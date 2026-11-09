import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../cli.ts';
import { checkFleetBuild } from './check-fleet-build.ts';
import { getDeclaredForwards as declaredForwards } from './get-declared-forwards.ts';
import { getDeclaredSessions as declaredSessions } from './get-declared-sessions.ts';
import { findRoleSkill } from './find-role-skill.ts';
import { roleName } from './role-name.ts';
import { rolesByName } from './roles-by-name.ts';
import { ROLES } from './roles.ts';
import { validateRoles } from './validate-roles.ts';
import { withStaleBuild } from './with-stale-build.ts';
import { forwardOf } from '../outbox/forward-of.ts';
import { setForward } from '../outbox/set-forward.ts';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { updateEnv } from '@zgeoff/testing/helpers';
import { createStubSystemctl } from '../../test/create-stub-systemctl.ts';
import { freshDb } from '../../test/helpers.ts';
import { findPath } from '../test-utils/find-path.ts';
import { buildSeeder } from '../test-utils/build-seeder.ts';

test('the table loads and each single role resolves to one declared session', () => {
  expect(ROLES.sessions.length).toBeGreaterThan(5);
  const names = declaredSessions().map((s) => s.name);
  for (const r of ['owner', 'orchestrator', 'reviewer', 'qa'] as const) expect(names).toContain(roleName(r));
  expect(new Set(names).size).toBe(names.length);
  expect(names).toContain(declaredForwards()['z-refine']!);
});

test('a valid object passes', () => {
  const table = {
    sessions: [
      { name: 'z-aa', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['owner'] },
      { name: 'z-bb', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['orchestrator'] },
      { name: 'z-cc', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['reviewer'] },
      { name: 'z-dd', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['qa', 'triage'] },
    ],
    forwards: { 'z-old': 'z-dd' },
  };

  expect(validateRoles(table).sessions).toHaveLength(4);
});

test('it passes pluginDirs that are absolute or ~/ folders', () => {
  const withDirs = {
    sessions: [
      { name: 'z-aa', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['owner'], pluginDirs: ['~/plugins/band', '/opt/plugins/pane'] },
      { name: 'z-bb', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['orchestrator'] },
      { name: 'z-cc', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['reviewer'] },
      { name: 'z-dd', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['qa', 'triage'] },
    ],
    forwards: { 'z-old': 'z-dd' },
  };
  const without = {
    sessions: [
      { name: 'z-aa', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['owner'] },
      { name: 'z-bb', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['orchestrator'] },
      { name: 'z-cc', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['reviewer'] },
      { name: 'z-dd', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['qa', 'triage'] },
    ],
    forwards: { 'z-old': 'z-dd' },
  };

  expect(validateRoles(withDirs).sessions[0]).toMatchObject({ pluginDirs: ['~/plugins/band', '/opt/plugins/pane'] });
  expect(validateRoles(without).sessions[0]).not.toHaveProperty('pluginDirs');
});

test.each([[[]], [['plugins/band']], [['~/plugins/../band']], ['band'], [[7]]])('it refuses pluginDirs %j by name', (pluginDirs) => {
  const table = {
    sessions: [
      { name: 'z-aa', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['owner'], pluginDirs },
      { name: 'z-bb', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['orchestrator'] },
      { name: 'z-cc', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['reviewer'] },
      { name: 'z-dd', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['qa', 'triage'] },
    ],
    forwards: { 'z-old': 'z-dd' },
  };

  expect(() => validateRoles(table)).toThrow('sessions[0].pluginDirs');
});

test('it refuses a repeated session name by name', () => {
  const table = {
    sessions: [
      { name: 'z-aa', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['owner'] },
      { name: 'z-bb', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['orchestrator'] },
      { name: 'z-cc', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['reviewer'] },
      { name: 'z-dd', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['qa', 'triage'] },
      { name: 'z-aa', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: [] },
    ],
    forwards: { 'z-old': 'z-dd' },
  };

  expect(() => validateRoles(table)).toThrow('sessions[4].name');
});

test('it refuses an unknown role', () => {
  const table = {
    sessions: [
      { name: 'z-aa', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['owner', 'boss'] },
      { name: 'z-bb', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['orchestrator'] },
      { name: 'z-cc', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['reviewer'] },
      { name: 'z-dd', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['qa', 'triage'] },
    ],
    forwards: { 'z-old': 'z-dd' },
  };

  expect(() => validateRoles(table)).toThrow('unknown role');
});

test('it refuses two holders of the owner role', () => {
  const table = {
    sessions: [
      { name: 'z-aa', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['owner'] },
      { name: 'z-bb', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['orchestrator', 'owner'] },
      { name: 'z-cc', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['reviewer'] },
      { name: 'z-dd', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['qa', 'triage'] },
    ],
    forwards: { 'z-old': 'z-dd' },
  };

  expect(() => validateRoles(table)).toThrow('roles.owner');
});

test('it refuses a missing reviewer', () => {
  const table = {
    sessions: [
      { name: 'z-aa', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['owner'] },
      { name: 'z-bb', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['orchestrator'] },
      { name: 'z-cc', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: [] },
      { name: 'z-dd', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['qa', 'triage'] },
    ],
    forwards: { 'z-old': 'z-dd' },
  };

  expect(() => validateRoles(table)).toThrow('roles.reviewer');
});

test('it refuses a forward to an undeclared session', () => {
  const table = {
    sessions: [
      { name: 'z-aa', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['owner'] },
      { name: 'z-bb', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['orchestrator'] },
      { name: 'z-cc', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['reviewer'] },
      { name: 'z-dd', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['qa', 'triage'] },
    ],
    forwards: { 'z-old': 'z-nobody' },
  };

  expect(() => validateRoles(table)).toThrow('forwards.z-old');
});

test('it refuses an upper-case session name', () => {
  const table = {
    sessions: [
      { name: 'Z-Aa', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['owner'] },
      { name: 'z-bb', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['orchestrator'] },
      { name: 'z-cc', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['reviewer'] },
      { name: 'z-dd', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['qa', 'triage'] },
    ],
    forwards: { 'z-old': 'z-dd' },
  };

  expect(() => validateRoles(table)).toThrow('sessions[0].name');
});

test('it refuses a cwd outside defs', () => {
  const table = {
    sessions: [
      { name: 'z-aa', skills: ['kettle'], cwd: 'elsewhere', model: 'opus', wake: true, roles: ['owner'] },
      { name: 'z-bb', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['orchestrator'] },
      { name: 'z-cc', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['reviewer'] },
      { name: 'z-dd', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['qa', 'triage'] },
    ],
    forwards: { 'z-old': 'z-dd' },
  };

  expect(() => validateRoles(table)).toThrow('sessions[0].cwd');
});

test('it refuses an empty skills list without a prompt', () => {
  const table = {
    sessions: [
      { name: 'z-aa', skills: [], cwd: 'defs', model: 'opus', wake: true, roles: ['owner'] },
      { name: 'z-bb', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['orchestrator'] },
      { name: 'z-cc', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['reviewer'] },
      { name: 'z-dd', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['qa', 'triage'] },
    ],
    forwards: { 'z-old': 'z-dd' },
  };

  expect(() => validateRoles(table)).toThrow('sessions[0].prompt');
});

test.each([[['Kettle']], [['kettle', 'kettle']], [['kettle', 7]], ['kettle'], [null], [undefined]])('it refuses skills %j by name', (skills) => {
  const table = {
    sessions: [
      { name: 'z-aa', skills, cwd: 'defs', model: 'opus', wake: true, roles: ['owner'] },
      { name: 'z-bb', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['orchestrator'] },
      { name: 'z-cc', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['reviewer'] },
      { name: 'z-dd', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['qa', 'triage'] },
    ],
    forwards: { 'z-old': 'z-dd' },
  };

  expect(() => validateRoles(table)).toThrow('sessions[0].skills');
});

test('it refuses a prompt beside a non-empty skills list', () => {
  const table = {
    sessions: [
      { name: 'z-aa', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['owner'], prompt: 'main:prompts/kettle.md' },
      { name: 'z-bb', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['orchestrator'] },
      { name: 'z-cc', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['reviewer'] },
      { name: 'z-dd', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['qa', 'triage'] },
    ],
    forwards: { 'z-old': 'z-dd' },
  };

  expect(() => validateRoles(table)).toThrow('sessions[0].prompt');
});

test('it keeps skills that have no directory, and the role skill is the first one', () => {
  const table = {
    sessions: [
      { name: 'z-aa', skills: ['kettle', 'teapot-shared'], cwd: 'defs', model: 'opus', wake: true, roles: ['owner'] },
      { name: 'z-bb', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['orchestrator'] },
      { name: 'z-cc', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['reviewer'] },
      { name: 'z-dd', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['qa', 'triage'] },
    ],
    forwards: { 'z-old': 'z-dd' },
  };
  const [session] = validateRoles(table).sessions;

  expect(session).toMatchObject({ skills: ['kettle', 'teapot-shared'] });
  expect(session && findRoleSkill(session)).toBe('kettle');
  expect(findRoleSkill({ skills: [] })).toBeNull();
});

test.each(['kettle-prompt.md', 'main:prompts/kettle.md'])('prompt %s passes for a session with no skill', (prompt) => {
  const table = {
    sessions: [
      { name: 'z-aa', skills: [], cwd: 'defs', model: 'opus', wake: true, roles: ['owner'], prompt },
      { name: 'z-bb', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['orchestrator'] },
      { name: 'z-cc', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['reviewer'] },
      { name: 'z-dd', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['qa', 'triage'] },
    ],
    forwards: { 'z-old': 'z-dd' },
  };

  expect(validateRoles(table).sessions[0]).toMatchObject({ prompt });
});

test.each(['prompts/kettle.md', 'main:', 'main:../kettle.md', 'main:prompts/../kettle.md', 'main:/etc/kettle.md'])('prompt %s is refused by name', (prompt) => {
  const table = {
    sessions: [
      { name: 'z-aa', skills: [], cwd: 'defs', model: 'opus', wake: true, roles: ['owner'], prompt },
      { name: 'z-bb', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['orchestrator'] },
      { name: 'z-cc', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['reviewer'] },
      { name: 'z-dd', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['qa', 'triage'] },
    ],
    forwards: { 'z-old': 'z-dd' },
  };

  expect(() => validateRoles(table)).toThrow('sessions[0].prompt');
});

test('the validator takes a release session, and the release role lists its holders', () => {
  const table = {
    sessions: [
      { name: 'z-aa', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['owner'] },
      { name: 'z-bb', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['orchestrator'] },
      { name: 'z-cc', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['reviewer'] },
      { name: 'z-dd', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['qa', 'triage'] },
      { name: 'z-ee', skills: ['kettle'], cwd: 'defs', model: 'opus', wake: true, roles: ['release'] },
    ],
    forwards: { 'z-old': 'z-dd' },
  };

  expect(validateRoles(table).sessions.map((session) => session.roles)).toStrictEqual([['owner'], ['orchestrator'], ['reviewer'], ['qa', 'triage'], ['release']]);
  expect(Array.isArray(rolesByName().release)).toBe(true);
});

test('a declared forward needs no meta row, and a meta row wins', () => {
  const ctx = setupTest();
  const declared = declaredForwards()['z-refine'];
  invariant(declared);
  expect(forwardOf(ctx.db, 'z-refine')).toBe(declared);
  ctx.seed.meta({ key: 'outbox_forwards', value: JSON.stringify({ 'z-refine': 'z-other' }) });
  expect(forwardOf(ctx.db, 'z-refine')).toBe('z-other');
});

test('no session-name literal sits in src/ outside roles.ts', () => {
  const hits: string[] = [];
  for (const file of readdirSync(`${import.meta.dir}/..`, { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'roles.ts')) {
    const code = readFileSync(`${import.meta.dir}/../${file}`, 'utf8').replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/\/\/.*$/gmu, '');
    for (const match of code.matchAll(/['"`]z-[a-z]+['"`]/gu)) {
      hits.push(`${file}: ${match[0]}`);
    }
  }
  expect(hits).toEqual([]);
});

function setupTest() {
  const database = freshDb();
  onTestFinished(database.cleanup);
  const out: string[] = [];
  const originalLog = console.log;
  console.log = (line: string) => out.push(line);
  onTestFinished(() => {
    console.log = originalLog;
  });
  return { db: database.db, directory: database.dir, out, seed: buildSeeder(database) };
}

test('a forward declared in fleet.json cannot be removed by command; a stored one can', () => {
  const ctx = setupTest();
  const [from] = Object.keys(declaredForwards());
  invariant(from);
  expect(() => setForward(ctx.db, from, null)).toThrow('declared in fleet.json');
  setForward(ctx.db, 'z-gone', roleName('qa'));
  setForward(ctx.db, 'z-gone', null);
  expect(forwardOf(ctx.db, 'z-gone')).toBe('z-gone');
});

test('removing a stored override refuses when the declared forward it brings back makes a loop', () => {
  const ctx = setupTest();
  const [from] = Object.keys(declaredForwards());
  invariant(from);
  const declaredTo = declaredForwards()[from];
  invariant(declaredTo);
  setForward(ctx.db, from, roleName('qa'));
  setForward(ctx.db, declaredTo, from);
  expect(() => setForward(ctx.db, from, null)).toThrow('makes a loop');
  expect(forwardOf(ctx.db, declaredTo)).toBe(roleName('qa'));
  setForward(ctx.db, declaredTo, null);
  setForward(ctx.db, from, null);
  expect(forwardOf(ctx.db, from)).toBe(declaredTo);
});

test('a retired role holder is left out of the roles', () => {
  const r = rolesByName([roleName('reviewer')]);
  expect(r.reviewer).toBeNull();
  expect(r.owner).toBe(roleName('owner'));
});

test('hq fleet --json carries the stale-build warning when the checkout fleet.json differs', async () => {
  const ctx = setupTest();

  // hq fleet reads its timer through systemctl, which a host without systemd lacks.
  updateEnv('PATH', `${createStubSystemctl({ directory: ctx.directory, show: {} }).bin}:${process.env['PATH'] ?? ''}`);
  const fleetText = readFileSync(join(import.meta.dir, '../../fleet.json'), 'utf8');
  const changed = z.looseObject({ forwards: z.record(z.string(), z.string()) }).parse(JSON.parse(fleetText));
  const directory = join(ctx.directory, 'projects');
  updateEnv('HQ_PROJECTS', directory);
  changed.forwards['z-kettle'] = 'z-q';
  mkdirSync(join(directory, 'hq'), { recursive: true });
  writeFileSync(join(directory, 'hq', 'fleet.json'), JSON.stringify(changed));
  const code = await main(['fleet', '--json']);
  expect(code).toBe(0);
  const report: unknown = JSON.parse(ctx.out.join('\n'));
  expect(findPath(report, 'staleBuild')).toContain(`older fleet.json than ${directory}/hq/fleet.json`);
});

test('hq fleet --json gives each session its skill and roles, plus the roles and forwards', async () => {
  const ctx = setupTest();

  // hq fleet reads its timer through systemctl, which a host without systemd lacks.
  updateEnv('PATH', `${createStubSystemctl({ directory: ctx.directory, show: {} }).bin}:${process.env['PATH'] ?? ''}`);
  expect(await main(['fleet', '--json'])).toBe(0);
  const entrySchema = z.looseObject({ name: z.string(), skill: z.string().nullable(), skills: z.array(z.string()), roles: z.array(z.string()) });
  const fleetSchema = z.looseObject({ declared: z.array(entrySchema), roles: z.record(z.string(), z.unknown()), forwards: z.record(z.string(), z.string()) });
  const fleet = fleetSchema.parse(JSON.parse(ctx.out.join('\n')));
  const developer = fleet.declared.find((entry) => entry.name === 'z-q');
  expect(developer?.skill).toBeNull();
  expect(developer?.skills).toStrictEqual([]);
  expect(developer?.roles).toStrictEqual(['developer']);
  const owner = fleet.declared.find((entry) => entry.name === roleName('owner'));
  expect(owner?.skill).toBe('intake');
  expect(owner?.skills).toStrictEqual(['intake', 'owner-calls', 'tickets', 'evidence', 'delivery-report']);
  for (const entry of fleet.declared) {
    expect(entry.skill).toBe(entry.skills[0] ?? null);
  }
  expect(owner?.roles).toStrictEqual(['owner']);
  expect(owner?.['cwd']).toBeTruthy();
  expect(fleet.roles).toStrictEqual(rolesByName());
  expect(fleet.roles['reviewer']).toBe(roleName('reviewer'));
  expect(fleet.roles['developer']).toStrictEqual(['z-q']);
  expect(fleet.forwards['z-refine']).toBe(declaredForwards()['z-refine']);

  // The compact hook (.claude/hooks/print-skills.sh) reads these: change it with them.
  for (const entry of fleet.declared) {
    expect(Object.keys(entry)).toStrictEqual(expect.arrayContaining(['name', 'skills', 'skill']));
  }
  expect('last' in fleet).toBe(true);
});

test('the stale-build check is quiet when the checkout fleet.json matches the build, or is missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hq-fleet-build-'));
  try {
    writeFileSync(join(dir, 'fleet.json'), readFileSync(join(import.meta.dir, '../../fleet.json'), 'utf8'));
    expect(checkFleetBuild(join(dir, 'fleet.json'))).toBeNull();
    expect(checkFleetBuild(join(dir, 'none.json'))).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the stale-build check warns when the checkout fleet.json differs from the build', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hq-fleet-build-'));
  try {
    const fleetText = readFileSync(join(import.meta.dir, '../../fleet.json'), 'utf8');
    const sessionSchema = z.looseObject({ model: z.string() });
    const changed = z.looseObject({ sessions: z.array(sessionSchema) }).parse(JSON.parse(fleetText));
    const path = join(dir, 'fleet.json');
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


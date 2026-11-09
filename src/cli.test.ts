import { expect, mock, onTestFinished, spyOn, test } from 'bun:test';
import { findPath } from './test-utils/find-path.ts';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpResponse, http } from 'msw';
import { z } from 'zod';
import rulesTable from '../lanes.json';
import { ANTHROPIC_MESSAGES_URL, slotUsage } from '../mocks/anthropic-handlers.ts';
import { LINEAR_GRAPHQL_URL, linearIssues } from '../mocks/linear-handlers.ts';
import { server } from '../mocks/node.ts';
import { createStubOp } from '../test/create-stub-op.ts';
import { NOON_SYDNEY, at, createPushedClone, fakeAtc, freshDb } from '../test/helpers.ts';
import { readSlotRows } from './capacity/fleet/read-slot-rows.ts';
import { writeCapacitySample } from './capacity/write-capacity-sample.ts';
import { updateEnv } from '@zgeoff/testing/helpers';
import { main } from './cli.ts';
import { overrideEnv } from './config/override-env.ts';
import { setMeta } from './db/set-meta.ts';
import { loadActionsSpend } from './goals/load-actions-spend.ts';
import { createGrantMark } from './grants/create-grant-mark.ts';
import { recordGrantAction } from './grants/record-grant-action.ts';
import { seedVoidedGrantAction } from './grants/test-utils/seed-voided-grant-action.ts';
import { readReadySnapshot } from './lanes/read-ready-snapshot.ts';
import { READY_ISSUES_KEY } from './lanes/ready-issues-key.ts';
import { resetKey } from './linear/reset-key.ts';
import { updateNoslopRepos } from './noslop/update-noslop-repos.ts';
import { writeNoslopSettings } from './noslop/write-noslop-settings.ts';
import type { RunResult, Runner } from './runner/types.ts';
import { addPr } from './runs/add-pr.ts';
import { addRun } from './runs/add-run.ts';
import { setState } from './runs/set-state.ts';
import { writeBrokerSlot } from './slots/write-broker-slot.ts';
import { getStateRoles } from './state/get-state-roles.ts';
import { buildMockSha } from '../test/build-mock-sha.ts';
import { buildReadyIssue } from '../test/build-ready-issue.ts';
import { buildStubFinalGH } from '../test/build-stub-final-gh.ts';
import { buildStubBriefGH } from '../test/build-stub-brief-gh.ts';
import { requirePR } from './runs/require-pr.ts';
import { buildSeeder } from './test-utils/build-seeder.ts';

function setupTest() {
  const fresh = freshDb();
  const log = console.log;
  const lines: string[] = [];
  const bin = `${fresh.dir}/bin`;
  onTestFinished(fresh.cleanup);
  updateEnv('HQ_NOW', NOON_SYDNEY);
  updateEnv('HQ_NOTIFY', 'off');
  console.log = (line: string) => void lines.push(line);
  onTestFinished(() => (console.log = log));
  mkdirSync(bin);
  updateEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`);
  const op = createStubOp({ directory: fresh.dir, answers: {} });
  const opSettings = `${fresh.dir}/settings.local.json`;
  updateEnv('HQ_SLOTS_OP_SETTINGS', opSettings);
  return { db: fresh.db, seed: buildSeeder(fresh), path: fresh.path, directory: fresh.dir, bin, lines, op, opSettings };
}

test('it reports the plan for an oversized role file in hq state trim --dry-run', async () => {
  setupTest();
  const directory = mkdtempSync(join(tmpdir(), 'hq-state-cli-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  onTestFinished(overrideEnv('HQ_STATE_DIR', directory));
  const printed: string[] = [];
  const spy = spyOn(console, 'log').mockImplementation((line: string) => void printed.push(line));
  onTestFinished(() => spy.mockRestore());
  const role = getStateRoles().find((name) => name !== 'delivery') ?? '';
  writeFileSync(join(directory, `${role}.md`), `## Log\n${'09:10Z boiled the water\n'.repeat(1000)}09:11Z poured the tea\n`);

  await main(['state', 'trim', role, '--dry-run']);

  expect(printed).toStrictEqual([
    [
      `${role}.md: 24029 bytes before, 12269 bytes after, 490 entries moved`,
      `archive: ${join(directory, `${role}-archive-2026-10.md`)}`,
      `backup: ${join(directory, `${role}.md.bak-20261014T010000Z`)}`,
      'dry run: nothing written',
    ].join('\n'),
  ]);
});

test('it changes no file in hq state trim --dry-run', async () => {
  setupTest();
  const directory = mkdtempSync(join(tmpdir(), 'hq-state-cli-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  onTestFinished(overrideEnv('HQ_STATE_DIR', directory));
  const role = getStateRoles().find((name) => name !== 'delivery') ?? '';
  const original = `## Log\n${'09:10Z boiled the water\n'.repeat(1000)}09:11Z poured the tea\n`;
  writeFileSync(join(directory, `${role}.md`), original);

  await main(['state', 'trim', role, '--dry-run']);

  expect(readdirSync(directory)).toStrictEqual([`${role}.md`]);
  expect(readFileSync(join(directory, `${role}.md`), 'utf8')).toBe(original);
});

test("hq goals sync stores the month's Actions spend from GitHub billing", async () => {
  const ctx = setupTest();
  writeFileSync(`${ctx.bin}/gh`, ['#!/bin/sh', 'case "$*" in', `  *settings/billing/usage*) echo '{"usageItems":[{"product":"actions","netAmount":12.5}]}' ;;`, '  "repo "*) echo "[]" ;;', '  *) echo \'[{"total_count":0,"incomplete_results":false,"items":[]}]\' ;;', 'esac', ''].join('\n'));
  chmodSync(`${ctx.bin}/gh`, 0o755);
  await main(['goals', 'sync', '--days', '1', '--json']);

  expect(loadActionsSpend(ctx.db, new Date(NOON_SYDNEY))).toBe(12.5);
});

test('hq goals sync replaces an earlier good Actions spend with unknown when gh fails', async () => {
  const ctx = setupTest();
  writeFileSync(`${ctx.bin}/gh`, ['#!/bin/sh', 'case "$*" in', `  *settings/billing/usage*) echo 'HTTP 403' >&2; exit 1 ;;`, '  "repo "*) echo "[]" ;;', '  *) echo \'[{"total_count":0,"incomplete_results":false,"items":[]}]\' ;;', 'esac', ''].join('\n'));
  chmodSync(`${ctx.bin}/gh`, 0o755);
  setMeta(ctx.db, 'actions_spend', JSON.stringify({ at: '2026-10-14T00:50:00Z', month: '2026-10', net: 4 }));
  await main(['goals', 'sync', '--days', '1', '--json']);

  expect(loadActionsSpend(ctx.db, new Date(NOON_SYDNEY))).toBeNull();
});

test('it warns in hq lanes status when the checkout lanes.json differs from the build', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/projects/hq`, { recursive: true });
  writeFileSync(`${fresh.dir}/projects/hq/lanes.json`, JSON.stringify({ ...rulesTable, readyState: 'Todo' }));
  const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), 'lanes', 'status', '--json'], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_PROJECTS: `${fresh.dir}/projects`, HQ_CAPACITY: `${fresh.dir}/scripts/capacity.sh`, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY, PATH: `${fresh.dir}/bin:${process.env['PATH']}` },
  });

  const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);

  expect(code).toBe(0);
  expect(JSON.parse(stdout)).toMatchObject({ staleBuild: `the installed hq carries an older lanes.json than ${fresh.dir}/projects/hq/lanes.json: the Ready read uses the old rules until \`bun run install-bin\` runs there` });
});

test('hq run place moves an imp run to local through the spawned CLI, and hq lanes counts it as local', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/skill/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/skill/pacing.json`, JSON.stringify({ slots: { imp: 2, local: 2 } }));
  const hq = async (...args: string[]): Promise<{ code: number; stdout: string }> => {
    const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), ...args, '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_PROJECTS: `${fresh.dir}/projects`, HQ_CAPACITY: `${fresh.dir}/skill/scripts/capacity.sh`, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY, HQ_AS: 'z-delivery', PATH: `${fresh.dir}/bin:${process.env['PATH']}` },
    });
    const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    return { code, stdout };
  };
  await hq('run', 'add', 'GEO-9894', '--title', 'Descale the kettle', '--where', 'imp');

  const placed = await hq('run', 'place', 'GEO-9894', 'local', '--note', 'its session runs on this host');
  const lanes = await hq('lanes');

  expect(placed.code).toBe(0);
  expect(JSON.parse(placed.stdout)).toMatchObject({ run: { issue: 'GEO-9894', place: 'local' } });
  expect(JSON.parse(lanes.stdout)).toMatchObject({ plan: { pool: { impRunning: 0, localRunning: 1 } } });
});

test('it prints in hq lanes that the design counts are unreadable, with the defaults it uses', async () => {
  const fresh = freshDb();
  const log = console.log;
  const printed: string[] = [];
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/skill/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/skill/pacing.json`, JSON.stringify({ slots: { imp: 2, local: 2 }, agentDesignSlots: 'two' }));
  onTestFinished(overrideEnv('HQ_CAPACITY', `${fresh.dir}/skill/scripts/capacity.sh`));
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('PATH', `${fresh.dir}/bin:${process.env['PATH']}`));
  console.log = (line: string) => void printed.push(line);
  onTestFinished(() => (console.log = log));

  const code = await main(['lanes']);

  expect(code).toBe(0);
  expect(printed.join('\n')).toInclude('design: counts unreadable (pacing.json: pacing.json designSlots and agentDesignSlots: give each a whole number from 0 to 100), using agent 2, with-geoff 1');
});

test('it names the design lane of an open design pass in the hq run show text', async () => {
  const fresh = freshDb();
  const log = console.log;
  const printed: string[] = [];
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  console.log = (line: string) => void printed.push(line);
  onTestFinished(() => (console.log = log));
  at(NOON_SYDNEY);
  addRun(fresh.db, { issue: 'GEO-9957', title: 'Design the kettle spout', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', design: 'agent', actor: 'z-delivery' });

  const code = await main(['run', 'show', 'GEO-9957']);

  expect(code).toBe(0);
  expect(printed.join('\n')).toInclude('| Agent working. (design pass: agent) |');
});

test('it marks the design pass PRs in the hq run show text', async () => {
  const fresh = freshDb();
  const log = console.log;
  const printed: string[] = [];
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  console.log = (line: string) => void printed.push(line);
  onTestFinished(() => (console.log = log));
  at(NOON_SYDNEY);
  addRun(fresh.db, { issue: 'GEO-9956', title: 'Design the kettle spout', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', design: 'agent', actor: 'z-delivery' });
  addPr(fresh.db, 'GEO-9956', 'kettle#71', 'z-delivery');
  setState(fresh.db, 'GEO-9956', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(fresh.db, { issue: 'GEO-9956', title: 'Build the kettle spout', place: 'imp', session: null, next: 'Building.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });

  const code = await main(['run', 'show', 'GEO-9956']);

  expect(code).toBe(0);
  expect(printed.join('\n')).toInclude('| kettle#71 open (design pass) |');
});

test('it prints the move from the design pass and its sessions in the hq run show text', async () => {
  const fresh = freshDb();
  const log = console.log;
  const printed: string[] = [];
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  console.log = (line: string) => void printed.push(line);
  onTestFinished(() => (console.log = log));
  at(NOON_SYDNEY);
  addRun(fresh.db, { issue: 'GEO-9955', title: 'Design the kettle lid', place: 'imp', session: 'a0000055-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', design: 'agent', actor: 'z-delivery' });
  setState(fresh.db, 'GEO-9955', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(fresh.db, { issue: 'GEO-9955', title: 'Build the kettle lid', place: 'imp', session: null, next: 'Building.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });

  const code = await main(['run', 'show', 'GEO-9955']);

  expect(code).toBe(0);
  expect(printed.join('\n')).toInclude(`  design pass (agent) became the build run ${NOON_SYDNEY}; its sessions: a0000055-aaaa-4aaa-8aaa-aaaaaaaaaaaa`);
});

test('it refuses hq run reopen on an agent pass while the agent lane is full', async () => {
  const fresh = freshDb();
  const log = console.log;
  const printed: string[] = [];
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/skill/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/skill/pacing.json`, JSON.stringify({ slots: { imp: 2, local: 2 }, designSlots: 1, agentDesignSlots: 1 }));
  onTestFinished(overrideEnv('HQ_CAPACITY', `${fresh.dir}/skill/scripts/capacity.sh`));
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_AS', 'z-delivery'));
  onTestFinished(overrideEnv('PATH', `${fresh.dir}/bin:${process.env['PATH']}`));
  console.log = (line: string) => void printed.push(line);
  onTestFinished(() => (console.log = log));
  at(NOON_SYDNEY);
  addRun(fresh.db, { issue: 'GEO-9961', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  setState(fresh.db, 'GEO-9961', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(fresh.db, { issue: 'GEO-9962', title: 'Design the kettle lid', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });

  const code = await main(['run', 'reopen', 'GEO-9961', '--json']);

  expect(code).toBe(1);
  expect(JSON.parse(printed.join(''))).toMatchObject({ ok: false, error: { code: 'design_full', message: 'GEO-9961: all 1 agent design passes are open (GEO-9962); close one with hq run done first' } });
});

test('it refuses hq run state --reopen on an agent pass while the agent lane is full', async () => {
  const fresh = freshDb();
  const log = console.log;
  const printed: string[] = [];
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/skill/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/skill/pacing.json`, JSON.stringify({ slots: { imp: 2, local: 2 }, designSlots: 1, agentDesignSlots: 1 }));
  onTestFinished(overrideEnv('HQ_CAPACITY', `${fresh.dir}/skill/scripts/capacity.sh`));
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_AS', 'z-delivery'));
  onTestFinished(overrideEnv('PATH', `${fresh.dir}/bin:${process.env['PATH']}`));
  console.log = (line: string) => void printed.push(line);
  onTestFinished(() => (console.log = log));
  at(NOON_SYDNEY);
  addRun(fresh.db, { issue: 'GEO-9961', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  setState(fresh.db, 'GEO-9961', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(fresh.db, { issue: 'GEO-9962', title: 'Design the kettle lid', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });

  const code = await main(['run', 'state', 'GEO-9961', 'working', '--reopen', '--json']);

  expect(code).toBe(1);
  expect(JSON.parse(printed.join(''))).toMatchObject({ ok: false, error: { code: 'design_full' } });
});

test('it moves a closed agent pass to another closed state with --reopen while the agent lane is full', async () => {
  const fresh = freshDb();
  const log = console.log;
  const printed: string[] = [];
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/skill/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/skill/pacing.json`, JSON.stringify({ slots: { imp: 2, local: 2 }, designSlots: 1, agentDesignSlots: 1 }));
  onTestFinished(overrideEnv('HQ_CAPACITY', `${fresh.dir}/skill/scripts/capacity.sh`));
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_AS', 'z-delivery'));
  onTestFinished(overrideEnv('PATH', `${fresh.dir}/bin:${process.env['PATH']}`));
  console.log = (line: string) => void printed.push(line);
  onTestFinished(() => (console.log = log));
  at(NOON_SYDNEY);
  addRun(fresh.db, { issue: 'GEO-9961', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  setState(fresh.db, 'GEO-9961', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(fresh.db, { issue: 'GEO-9962', title: 'Design the kettle lid', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });

  const code = await main(['run', 'state', 'GEO-9961', 'dropped', '--reopen', '--note', 'design pass not needed', '--json']);

  expect(code).toBe(0);
  expect(JSON.parse(printed.join(''))).toMatchObject({ ok: true, run: { issue: 'GEO-9961', state: 'dropped' } });
});

test('it refuses hq run add --design agent above the agent count', async () => {
  const fresh = freshDb();
  const log = console.log;
  const printed: string[] = [];
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/skill/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/skill/pacing.json`, JSON.stringify({ slots: { imp: 2, local: 2 }, designSlots: 1, agentDesignSlots: 1 }));
  onTestFinished(overrideEnv('HQ_CAPACITY', `${fresh.dir}/skill/scripts/capacity.sh`));
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_AS', 'z-delivery'));
  onTestFinished(overrideEnv('PATH', `${fresh.dir}/bin:${process.env['PATH']}`));
  console.log = (line: string) => void printed.push(line);
  onTestFinished(() => (console.log = log));
  at(NOON_SYDNEY);
  addRun(fresh.db, { issue: 'GEO-9951', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });

  const code = await main(['run', 'add', 'GEO-9952', '--title', 'Design the kettle lid', '--design', 'agent', '--json']);

  expect(code).toBe(1);
  expect(JSON.parse(printed.join(''))).toMatchObject({ ok: false, error: { code: 'design_full', message: 'GEO-9952: all 1 agent design passes are open (GEO-9951); close one with hq run done first' } });
});

test('it adds a with-geoff pass above the count through hq run add --asked', async () => {
  const fresh = freshDb();
  const log = console.log;
  const printed: string[] = [];
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/skill/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/skill/pacing.json`, JSON.stringify({ slots: { imp: 2, local: 2 }, designSlots: 1, agentDesignSlots: 1 }));
  onTestFinished(overrideEnv('HQ_CAPACITY', `${fresh.dir}/skill/scripts/capacity.sh`));
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_AS', 'z-delivery'));
  onTestFinished(overrideEnv('PATH', `${fresh.dir}/bin:${process.env['PATH']}`));
  console.log = (line: string) => void printed.push(line);
  onTestFinished(() => (console.log = log));
  at(NOON_SYDNEY);
  addRun(fresh.db, { issue: 'GEO-9953', title: 'Design the whistle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'with-geoff', actor: 'z-delivery' });

  const code = await main(['run', 'add', 'GEO-9954', '--title', 'Design the handle', '--design', 'with-geoff', '--asked', 'chat 29 Oct', '--json']);

  expect(code).toBe(0);
  expect(JSON.parse(printed.join(''))).toMatchObject({ run: { issue: 'GEO-9954', design_lane: 'with-geoff' } });
});

test('it shows the design lanes apart from the delivery pool in hq lanes --json', async () => {
  const fresh = freshDb();
  const log = console.log;
  const printed: string[] = [];
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/skill/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/skill/pacing.json`, JSON.stringify({ slots: { imp: 2, local: 2 }, designSlots: 1, agentDesignSlots: 1 }));
  onTestFinished(overrideEnv('HQ_CAPACITY', `${fresh.dir}/skill/scripts/capacity.sh`));
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_AS', 'z-delivery'));
  onTestFinished(overrideEnv('PATH', `${fresh.dir}/bin:${process.env['PATH']}`));
  console.log = (line: string) => void printed.push(line);
  onTestFinished(() => (console.log = log));
  at(NOON_SYDNEY);
  addRun(fresh.db, { issue: 'GEO-9951', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  addRun(fresh.db, { issue: 'GEO-9953', title: 'Design the whistle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'with-geoff', actor: 'z-delivery' });
  addRun(fresh.db, { issue: 'GEO-9954', title: 'Design the handle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'with-geoff', asked: 'chat 29 Oct', actor: 'z-delivery' });

  const code = await main(['lanes', '--json']);

  expect(code).toBe(0);
  expect(JSON.parse(printed.join(''))).toMatchObject({ plan: { pool: { impRunning: 0, localRunning: 0 }, design: { agent: { open: 1, slots: 1 }, withGeoff: { open: 2, slots: 1, asked: ['chat 29 Oct'] } } }, placeTypes: null });
});

test('it shows the parsed placeTypes and the place of each next issue in hq lanes --json', async () => {
  const fresh = freshDb();
  const log = console.log;
  const printed: string[] = [];
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/skill/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/skill/pacing.json`, JSON.stringify({ slots: { imp: 0, local: 1 }, placeTypes: { local: ['investigation'] } }));
  onTestFinished(overrideEnv('HQ_CAPACITY', `${fresh.dir}/skill/scripts/capacity.sh`));
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_AS', 'z-delivery'));
  onTestFinished(overrideEnv('PATH', `${fresh.dir}/bin:${process.env['PATH']}`));
  console.log = (line: string) => void printed.push(line);
  onTestFinished(() => (console.log = log));
  at(NOON_SYDNEY);
  setMeta(fresh.db, READY_ISSUES_KEY, JSON.stringify({ at: NOON_SYDNEY, eligible: [buildReadyIssue('GEO-9871', { type: 'Bug' }), buildReadyIssue('GEO-9872', { type: 'Investigation' })], design: [] }));

  const code = await main(['lanes', '--json']);

  expect(code).toBe(0);
  expect(JSON.parse(printed.join(''))).toMatchObject({ placeTypes: { local: ['investigation'] }, plan: { plan: { picks: [{ issue: 'GEO-9872', term: null, reserve: null, place: 'local' }] } } });
});

test('it keeps the design pass in hq run show after the build run starts', async () => {
  const fresh = freshDb();
  const log = console.log;
  const printed: string[] = [];
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/skill/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/skill/pacing.json`, JSON.stringify({ slots: { imp: 2, local: 2 }, designSlots: 1, agentDesignSlots: 1 }));
  onTestFinished(overrideEnv('HQ_CAPACITY', `${fresh.dir}/skill/scripts/capacity.sh`));
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_AS', 'z-delivery'));
  onTestFinished(overrideEnv('PATH', `${fresh.dir}/bin:${process.env['PATH']}`));
  console.log = (line: string) => void printed.push(line);
  onTestFinished(() => (console.log = log));
  at(NOON_SYDNEY);
  addRun(fresh.db, { issue: 'GEO-9951', title: 'Design the kettle spout', place: 'local', session: 'a0000051-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  setState(fresh.db, 'GEO-9951', 'dropped', { note: 'design settled elsewhere' }, 'z-delivery');
  addRun(fresh.db, { issue: 'GEO-9951', title: 'Build the kettle spout', place: 'local', session: 'a0000052-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });

  const code = await main(['run', 'show', 'GEO-9951', '--json']);

  expect(code).toBe(0);
  expect(JSON.parse(printed.join(''))).toMatchObject({
    run: { issue: 'GEO-9951', design_lane: null, state: 'working', sessions: [{ session_id: 'a0000052-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, { session_id: 'a0000051-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 0 }] },
    designPass: [{ designLane: 'agent', designSessions: ['a0000051-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] }],
  });
});

test('it refuses hq run add --design while pacing.json gets a design count wrong', async () => {
  const fresh = freshDb();
  const log = console.log;
  const printed: string[] = [];
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/skill/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/skill/pacing.json`, JSON.stringify({ slots: { imp: 2, local: 2 }, agentDesignSlots: 'two' }));
  onTestFinished(overrideEnv('HQ_CAPACITY', `${fresh.dir}/skill/scripts/capacity.sh`));
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_AS', 'z-delivery'));
  onTestFinished(overrideEnv('PATH', `${fresh.dir}/bin:${process.env['PATH']}`));
  console.log = (line: string) => void printed.push(line);
  onTestFinished(() => (console.log = log));
  at(NOON_SYDNEY);

  const code = await main(['run', 'add', 'GEO-9955', '--title', 'Design the kettle spout', '--design', 'agent', '--json']);

  expect(code).toBe(1);
  expect(JSON.parse(printed.join(''))).toMatchObject({ ok: false, error: { code: 'no_lanes', message: 'pacing.json: pacing.json designSlots and agentDesignSlots: give each a whole number from 0 to 100; hq adds no design pass until pacing.json gives its counts' } });
});

test('hq unblock add files a watch with a deadline, and hq unblock list shows it overdue once the deadline passes', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const hq = async (now: string, ...args: string[]): Promise<{ code: number; stdout: string }> => {
    const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), 'unblock', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_NOTIFY: 'off', HQ_NOW: now, HQ_AS: 'kettle-qa' },
    });
    const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    return { code, stdout };
  };
  const added = await hq(NOON_SYDNEY, 'add', '--id', 'kettle-release', '--task', 'Live-check the kettle release', '--kind', 'watch', '--deadline', '2026-10-14T02:00:00Z', '--done-when', 'release:kettle-co/kettle', '--json');

  const listed = await hq('2026-10-14T02:30:00Z', 'list');
  const json = await hq('2026-10-14T02:30:00Z', 'list', '--json');

  expect(added.code).toBe(0);
  expect(listed.stdout).toBe('Live-check the kettle release · watch · done when release:kettle-co/kettle · deadline 2026-10-14T02:00:00Z OVERDUE · added 2026-10-14T01:00:00Z · id kettle-release\n');
  expect(JSON.parse(json.stdout)).toMatchObject({ items: [{ id: 'kettle-release', kind: 'watch', deadline: '2026-10-14T02:00:00Z', overdue: true }] });
});

test('hq run done closes the run, forgets its session through atc, and notes the wrap-up on the run', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_AS', 'z-delivery'));
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', join(fresh.dir, 'atc.sock')));
  const printed: string[] = [];
  const log = console.log;
  console.log = (line: string) => printed.push(line);
  onTestFinished(() => (console.log = log));
  const clone = createPushedClone(fresh.dir, 'kettle-clone');
  const roster = [
    { id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: clone },
    { id: '0000a003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'teapot-agent', alive: true, state: 'done' },
  ];
  const atc = fakeAtc(fresh.dir, roster);
  onTestFinished(atc.stop);
  addRun(fresh.db, { issue: 'GEO-9821', title: 'Invented kettle descaler', place: 'local', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });

  const code = await main(['run', 'done', 'GEO-9821', '--json']);

  expect(code).toBe(0);
  const report: unknown = JSON.parse(printed.join('\n'));
  expect(findPath(report, 'wrapUp')).toStrictEqual({ forgotten: ['0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], destroyed: [], kept: [], failed: [] });
  expect(atc.calls).toStrictEqual([
    { method: 'session.update', input: { session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pinned: false } },
    { method: 'session.kill', input: { session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', stopOnly: true } },
    { method: 'session.update', input: { session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pinned: false } },
    { method: 'session.forget', input: { session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', refusePinned: true } },
  ]);
  expect(fresh.db.query("SELECT state FROM runs WHERE issue = 'GEO-9821'").get()).toStrictEqual({ state: 'done' });
  expect(fresh.db.query("SELECT label, text FROM run_notes WHERE issue = 'GEO-9821'").all()).toStrictEqual([{ label: 'wrap-up', text: 'Wrap-up: forgot 0000a001.' }]);
});

test('hq focus set, show and clear run through the spawned CLI, with a repeated --reserve', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/op`, '#!/bin/sh\necho "op: no session" >&2\nexit 1\n');
  chmodSync(`${fresh.dir}/bin/op`, 0o755);
  const hq = async (...args: string[]): Promise<{ code: number; stdout: string }> => {
    const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), 'focus', ...args, '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY, HQ_AS: 'z-delivery', PATH: `${fresh.dir}/bin:${process.env['PATH']}` },
    });
    const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    return { code, stdout };
  };

  const set = await hq('set', 'bug,nixie:feature', '--reserve', 'nixie=1', '--reserve', 'hq=2');
  const shown = await hq('show');
  const cleared = await hq('clear');
  const after = await hq('show');

  expect(set.code).toBe(0);
  expect(JSON.parse(shown.stdout)).toMatchObject({
    focus: { terms: [{ text: 'bug' }, { text: 'nixie:feature' }], reserves: [{ area: 'nixie', slots: 1 }, { area: 'hq', slots: 2 }], setBy: 'z-delivery' },
    counts: null,
  });
  expect(JSON.parse(cleared.stdout)).toMatchObject({ cleared: true });
  expect(JSON.parse(after.stdout)).toMatchObject({ focus: null });
});

test('hq lanes skip sets, lists and drops a skip through the spawned CLI', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const hq = async (...args: string[]): Promise<{ code: number; stdout: string }> => {
    const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), 'lanes', 'skip', ...args, '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY, HQ_AS: 'z-delivery' },
    });
    const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    return { code, stdout };
  };

  const set = await hq('GEO-9881', '--until', 'GEO-9889', '--reason', 'waits on the descaler PR');
  const listed = await hq('list');
  const dropped = await hq('drop', 'GEO-9881');
  const after = await hq('list');

  expect(set.code).toBe(0);
  expect(JSON.parse(listed.stdout)).toStrictEqual({ ok: true, skips: [{ issue: 'GEO-9881', until: 'GEO-9889', reason: 'waits on the descaler PR', by: 'z-delivery', at: NOON_SYDNEY }], unread: {} });
  expect(JSON.parse(dropped.stdout)).toStrictEqual({ ok: true, issue: 'GEO-9881', dropped: true });
  expect(JSON.parse(after.stdout)).toStrictEqual({ ok: true, skips: [], unread: {} });
});

test('hq lanes shows the cause of the empty slots and the minutes by cause for today in its text and in --json slotCauses', async () => {
  const ctx = setupTest();
  writeFileSync(`${ctx.directory}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${ctx.directory}/bin/systemctl`, 0o755);
  mkdirSync(`${ctx.directory}/skill/scripts`, { recursive: true });
  writeFileSync(`${ctx.directory}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${ctx.directory}/skill/pacing.json`, JSON.stringify({ slots: { imp: 0, local: 2 } }));
  setMeta(ctx.db, 'lanes_ready_issues', JSON.stringify({ at: '2026-10-14T00:55:00Z', eligible: [], design: [] }));
  setMeta(ctx.db, 'lanes_promotable_focus', JSON.stringify({ at: '2026-10-14T00:50:00Z', count: 3, focus: '[]' }));
  setMeta(ctx.db, 'lanes_slot_cause_since', JSON.stringify({ cause: 'triage', since: '2026-10-14T00:40:00Z' }));
  ctx.seed.slotMinutes({ day: '2026-10-14', cause: 'delivery', minutes: 12.4 });
  ctx.seed.slotMinutes({ day: '2026-10-14', cause: 'triage', minutes: 40.6 });
  ctx.seed.slotMinutes({ day: '2026-10-13', cause: 'supply', minutes: 99 });
  const hq = async (...args: string[]): Promise<string> => {
    const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), 'lanes', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: ctx.directory, HQ_DB: ctx.path, HQ_PROJECTS: `${ctx.directory}/projects`, HQ_CAPACITY: `${ctx.directory}/skill/scripts/capacity.sh`, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY, HQ_AS: 'z-delivery', PATH: `${ctx.directory}/bin:${process.env['PATH']}` },
    });
    const [, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    return stdout;
  };

  const text = await hq();
  const json = await hq('--json');

  expect(text).toInclude('cause: triage, 2 free slot(s) since 2026-10-14T00:40:00Z');
  expect(text).toInclude('empty slot-minutes today (Sydney): delivery 12, triage 41, supply 0');
  expect(findPath(JSON.parse(json), 'slotCauses')).toStrictEqual({
    now: { cause: 'triage', slots: 2, since: '2026-10-14T00:40:00Z', readyAgeMinutes: 5, reason: null, backlogError: null },
    today: { delivery: 12.4, triage: 40.6, supply: 0, design: 0 },
  });
});

test('hq lanes cap shows the stored cap with the working count', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  setMeta(fresh.db, 'lanes_cap', JSON.stringify({ cap: 7, until: '2026-10-18T21:00:00Z', reason: 'weekend pacing', by: 'z-stu', at: '2026-10-14T00:00:00Z' }));
  const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), 'lanes', 'cap', '--json'], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY } });

  const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);

  expect(code).toBe(0);
  expect(JSON.parse(stdout)).toStrictEqual({ ok: true, cap: { cap: 7, until: '2026-10-18T21:00:00Z', reason: 'weekend pacing', by: 'z-stu', at: '2026-10-14T00:00:00Z' }, working: 0, workingFrom: 'runs', error: null });
});

test('hq lanes cap refuses a change while atc cannot say who is asking, and stores nothing', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  setMeta(fresh.db, 'fleet_ids', JSON.stringify({ 'z-stu': 'kettle-1', 'z-delivery': 'kettle-2' }));
  const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), 'lanes', 'cap', '7', '--json'], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY, HQ_AS: 'z-stu' } });

  const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);

  expect(code).toBe(1);
  expect(JSON.parse(stdout)).toStrictEqual({ ok: false, error: { code: 'not_allowed', message: expect.stringMatching(/^atc could not say who is asking, so the lanes cap stays as it is: /u) } });
  expect(fresh.db.query("SELECT value FROM meta WHERE key = 'lanes_cap'").get()).toBeNull();
});

test('hq lanes cap refuses a count that is not a whole number', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), 'lanes', 'cap', 'seven', '--json'], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY } });

  const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);

  expect(code).toBe(1);
  expect(JSON.parse(stdout)).toStrictEqual({ ok: false, error: { code: 'bad_args', message: 'hq lanes cap takes a whole number from 0, or off, not "seven"; hq lanes cap | cap <n> [--until <ISO time|Ddd HH:MM>] [--reason TEXT] | cap off [--reason TEXT]' } });
});

test('hq lanes --json carries the stored cap with the working count and what limits the slots', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/skill/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/skill/pacing.json`, JSON.stringify({ slots: { imp: 0, local: 2 } }));
  setMeta(fresh.db, 'lanes_ready_issues', JSON.stringify({ at: '2026-10-14T00:55:00Z', eligible: [], design: [] }));
  setMeta(fresh.db, 'lanes_promotable_focus', JSON.stringify({ at: '2026-10-14T00:50:00Z', count: 3, focus: '[]' }));
  setMeta(fresh.db, 'lanes_cap', JSON.stringify({ cap: 1, until: '2026-10-18T21:00:00Z', reason: 'weekend pacing', by: 'z-stu', at: '2026-10-14T00:00:00Z' }));
  const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), 'lanes', '--json'], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_PROJECTS: `${fresh.dir}/projects`, HQ_CAPACITY: `${fresh.dir}/skill/scripts/capacity.sh`, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY, HQ_AS: 'z-delivery', PATH: `${fresh.dir}/bin:${process.env['PATH']}` },
  });

  const [, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);

  expect(findPath(JSON.parse(stdout), 'cap')).toStrictEqual({ cap: 1, until: '2026-10-18T21:00:00Z', reason: 'weekend pacing', by: 'z-stu', working: 0, limitedBy: 'cap', workingFrom: 'runs' });
});

test('hq lanes --json carries the stored cap the watcher enforces when pacing has no lanes', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/skill/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/skill/pacing.json`, '{}');
  setMeta(fresh.db, 'lanes_cap', JSON.stringify({ cap: 0, until: '2026-10-18T21:00:00Z', reason: 'kettle descaling', by: 'z-stu', at: '2026-10-14T00:00:00Z' }));
  const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), 'lanes', '--json'], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_PROJECTS: `${fresh.dir}/projects`, HQ_CAPACITY: `${fresh.dir}/skill/scripts/capacity.sh`, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY, HQ_AS: 'z-delivery', PATH: `${fresh.dir}/bin:${process.env['PATH']}` },
  });

  const [, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);

  expect(JSON.parse(stdout)).toMatchObject({ plan: null, cap: { cap: 0, until: '2026-10-18T21:00:00Z', reason: 'kettle descaling', by: 'z-stu', working: 0, limitedBy: 'pool', workingFrom: 'runs' } });
});

test('hq lanes prints the stored cap under the missing slot plan when pacing has no lanes', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/skill/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/skill/pacing.json`, '{}');
  setMeta(fresh.db, 'lanes_cap', JSON.stringify({ cap: 0, until: '2026-10-18T21:00:00Z', reason: 'kettle descaling', by: 'z-stu', at: '2026-10-14T00:00:00Z' }));
  const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), 'lanes'], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_PROJECTS: `${fresh.dir}/projects`, HQ_CAPACITY: `${fresh.dir}/skill/scripts/capacity.sh`, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY, HQ_AS: 'z-delivery', PATH: `${fresh.dir}/bin:${process.env['PATH']}` },
  });

  const [, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);

  expect(stdout.split('\n').slice(1, 3)).toStrictEqual([expect.stringMatching(/^lanes: no slot plan /u), 'cap: 0 until Mon 08:00 Sydney (kettle descaling), 0 working (counted by run: the atc reading is stale)']);
});

test('hq capacity --json carries the Claude burn hint from the usage samples', async () => {
  const ctx = setupTest();
  ctx.seed.usageSample({ at: '2026-10-14T00:30:00Z', account: 'kettle01', five_hour: 10, seven_day: 20 });
  ctx.seed.usageSample({ at: '2026-10-14T01:00:00Z', account: 'kettle01', five_hour: 12, seven_day: 22 });
  const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), 'capacity', 'show', '--json'], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, HOME: ctx.directory, HQ_DB: ctx.path, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY } });

  const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);

  expect(code).toBe(0);
  expect(JSON.parse(stdout)).toMatchObject({ hint: { hours: 2, limit: 95, account: 'kettle01', windows: [{ window: '7-day', samples: 2, ratePerHour: null }, { window: '5-hour', samples: 2, ratePerHour: null }] } });
});

test('hq grant void refuses bad arguments through the spawned CLI, and writes nothing', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at(NOON_SYDNEY);
  createGrantMark(fresh.db, { text: 'kettle PRs merge on green CI', ref: null, at: null, name: 'kettle-merges', actor: 'kettle-bot' });
  recordGrantAction(fresh.db, { grant: 'kettle-merges', target: 'kettle#9', note: null, actor: 'teapot-bot' });
  const actionsBefore = fresh.db.query('SELECT * FROM grant_actions ORDER BY id').all();
  const eventsBefore = fresh.db.query('SELECT * FROM events ORDER BY seq').all();
  const newsBefore = fresh.db.query('SELECT * FROM news ORDER BY id').all();
  const hq = async (...args: string[]): Promise<{ code: number; stdout: string }> => {
    const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), 'grant', 'void', ...args, '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY },
    });
    const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    return { code, stdout };
  };

  const noReason = await hq('1');
  const badID = await hq('kettle', '--reason', 'wrong PR');
  const blankReason = await hq('1', '--reason', '  ');

  expect([noReason.code, badID.code, blankReason.code]).toStrictEqual([1, 1, 1]);
  expect(JSON.parse(noReason.stdout)).toMatchObject({ ok: false, error: { code: 'bad_args', message: expect.stringContaining('--reason is required') } });
  expect(JSON.parse(badID.stdout)).toMatchObject({ ok: false, error: { code: 'bad_args', message: expect.stringContaining('the act id must be a positive whole number') } });
  expect(JSON.parse(blankReason.stdout)).toMatchObject({ ok: false, error: { code: 'bad_args', message: expect.stringContaining('--reason must say why') } });
  expect(fresh.db.query('SELECT * FROM grant_actions ORDER BY id').all()).toStrictEqual(actionsBefore);
  expect(fresh.db.query('SELECT * FROM events ORDER BY seq').all()).toStrictEqual(eventsBefore);
  expect(fresh.db.query('SELECT * FROM news ORDER BY id').all()).toStrictEqual(newsBefore);
});

test('hq grant void refuses a caller atc cannot name, whatever --by and HQ_AS claim, and the act stays', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at(NOON_SYDNEY);
  setMeta(fresh.db, 'fleet_ids', JSON.stringify({ 'z-stu': 'kettle-1', 'teapot-bot': 'kettle-2' }));
  createGrantMark(fresh.db, { text: 'kettle PRs merge on green CI', ref: null, at: null, name: 'kettle-merges', actor: 'kettle-bot' });
  recordGrantAction(fresh.db, { grant: 'kettle-merges', target: 'kettle#9', note: null, actor: 'teapot-bot' });
  const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), 'grant', 'void', '1', '--reason', 'wrong PR', '--by', 'z-stu', '--json'], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY, HQ_AS: 'z-stu', ATC_SESSION_ID: 'kettle-1' },
  });

  const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);

  expect(code).toBe(1);
  expect(JSON.parse(stdout)).toMatchObject({ ok: false, error: { code: 'not_allowed', message: expect.stringContaining('only teapot-bot, who logged grant action 1, or z-stu may void it; atc cannot say who is calling') } });
  expect(fresh.db.query('SELECT voided_at FROM grant_actions').all()).toStrictEqual([{ voided_at: null }]);
});

test('hq grant actions shows a voided act struck out with its reason in text and in --json, and leaves it out of the count', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at(NOON_SYDNEY);
  createGrantMark(fresh.db, { text: 'kettle PRs merge on green CI', ref: null, at: null, name: 'kettle-merges', actor: 'kettle-bot' });
  await seedVoidedGrantAction(fresh, { target: 'kettle#8' });
  recordGrantAction(fresh.db, { grant: 'kettle-merges', target: 'kettle#9', note: null, actor: 'teapot-bot' });
  const hq = async (...args: string[]): Promise<string> => {
    const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), 'grant', 'actions', '--since', '1d', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_NOTIFY: 'off', HQ_NOW: '2026-10-14T02:00:00Z' },
    });
    const [, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    return stdout;
  };

  const text = await hq();
  const json = await hq('--json');

  expect(text.trim()).toBe('kettle-merges (mark 1): 1: kettle#9 (teapot-bot); ~~kettle#8 (teapot-bot)~~ void act 1, 2026-10-14T01:30:00Z by z-stu: logged before the merge failed');
  expect(findPath(JSON.parse(json), 'grants', 0, 'voided')).toStrictEqual([{ id: 1, target: 'kettle#8', note: null, actor: 'teapot-bot', at: NOON_SYDNEY, voidedAt: '2026-10-14T01:30:00Z', voidedBy: 'z-stu', voidReason: 'logged before the merge failed' }]);
});

test('hq capacity says the slot reads are not set up, in text and in --json', async () => {
  const fresh = freshDb();
  const log = console.log;
  const lines: string[] = [];
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(() => (console.log = log));
  console.log = (line: string) => lines.push(line);

  await main(['capacity']);
  await main(['capacity', '--json']);

  expect(lines[0]).toInclude('  fleet: no forecast, slot reads are not set up');
  expect(findPath(JSON.parse(lines[1] ?? '{}'), 'fleet')).toMatchObject({ notSetUp: expect.stringContaining('no settings file at '), active: null, slots: [], forecast: null, note: 'slot reads are not set up' });
});

test('it reads the four slots through op and prints the fleet block without a token for hq capacity --refresh-slots', async () => {
  const ctx = setupTest();
  ctx.op.writeAnswers({
    'op://fleet/claude-setup-token-1/credential': 'sk-ant-kettle-cli-1',
    'op://fleet/claude-setup-token-2/credential': 'sk-ant-kettle-cli-2',
    'op://fleet/claude-setup-token-3/credential': 'sk-ant-kettle-cli-3',
    'op://fleet/claude-setup-token-4/credential': 'sk-ant-kettle-cli-4',
  });
  writeFileSync(ctx.opSettings, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'ops_kettle-profile-0001' } }));
  ctx.seed.usageSample({ at: '2026-10-14T00:55:00Z', account: 'abcdef012345', five_hour: 5, seven_day: 40, seven_day_resets_at: '2026-10-19T00:00:00Z' });
  slotUsage.set('Bearer sk-ant-kettle-cli-1', { seven: { utilization: 0.4, reset: 1_792_540_800 } });
  slotUsage.set('Bearer sk-ant-kettle-cli-2', { seven: { utilization: 0.4, reset: 1_792_368_000 } });
  slotUsage.set('Bearer sk-ant-kettle-cli-3', { seven: { utilization: 0.4, reset: 1_792_713_600 } });
  slotUsage.set('Bearer sk-ant-kettle-cli-4', { seven: { utilization: 0.6, reset: 1_792_800_000 } });
  await main(['capacity', '--refresh-slots']);

  const text = ctx.lines.join('\n');
  expect(text).toInclude('  slot 2 (active): 5h ?, 7d 40% (resets 19 Oct 00:00Z), read 0 min ago');
  expect(text).toInclude('  slot 1: 5h ?, 7d 40% (resets 21 Oct 00:00Z), read 0 min ago');
  expect(text).toInclude('  slot 4: 5h ?, 7d 60% (resets 24 Oct 00:00Z), read 0 min ago');
  expect(text).not.toInclude('sk-ant-kettle');
  expect(readSlotRows(ctx.db, new Date(0), new Date(NOON_SYDNEY))).toHaveLength(4);
});

test("it reads the broker slot's fleet-vault token in hq capacity broker after a refresh when the proof is more than 24 h old", async () => {
  const ctx = setupTest();
  ctx.op.writeAnswers({
    'op://fleet/claude-setup-token-1/credential': 'sk-ant-kettle-fleet-1',
    'op://fleet/claude-setup-token-2/credential': 'sk-ant-kettle-fleet-2',
    'op://fleet/claude-setup-token-3/credential': 'sk-ant-kettle-fleet-3',
    'op://claude-slots/claude-setup-token-1/credential': 'sk-ant-kettle-old-1',
    'op://claude-slots/claude-setup-token-2/credential': 'sk-ant-kettle-old-2',
    'op://claude-slots/claude-setup-token-3/credential': 'sk-ant-kettle-old-3',
  });
  writeFileSync(ctx.opSettings, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'ops_kettle-profile-0001' } }));
  writeBrokerSlot(ctx.db, { slot: '2', proof: 'req-7c8d', note: undefined, actor: 'z-release', at: new Date('2026-10-12T19:00:00Z') });
  slotUsage.set('Bearer sk-ant-kettle-fleet-1', { seven: { utilization: 0.4, reset: 1_792_540_800 } });
  slotUsage.set('Bearer sk-ant-kettle-fleet-2', { seven: { utilization: 0.4, reset: 1_792_540_800 } });
  slotUsage.set('Bearer sk-ant-kettle-fleet-3', { seven: { utilization: 0.4, reset: 1_792_540_800 } });
  slotUsage.set('Bearer sk-ant-kettle-old-1', { seven: { utilization: 0.97, reset: 1_792_540_800 } });
  slotUsage.set('Bearer sk-ant-kettle-old-2', { seven: { utilization: 0.97, reset: 1_792_540_800 } });
  slotUsage.set('Bearer sk-ant-kettle-old-3', { seven: { utilization: 0.97, reset: 1_792_540_800 } });
  await main(['capacity', '--refresh-slots']);

  await main(['capacity', 'broker', '--json']);
  const printed: unknown = JSON.parse(ctx.lines.at(-1) ?? '{}');

  expect(z.object({ broker: z.unknown() }).parse(printed).broker).toStrictEqual({ state: 'read', slot: 2, proof: 'req-7c8d', proofAgeHours: 30, from: 'slot-read', used: 40, resetsAt: '2026-10-21T00:00:00Z', readAt: '2026-10-14T01:00:00Z' });
});

test("it takes a newer login sample on the broker slot's account over the slot read in hq capacity broker", async () => {
  const ctx = setupTest();
  writeBrokerSlot(ctx.db, { slot: '2', proof: 'req-9b0c', note: undefined, actor: 'z-release', at: new Date('2026-10-13T22:00:00Z') });
  ctx.seed.slotUsage({ at: '2026-10-14T00:00:00Z', slot: 2, five: 20, fiveResetsAt: '2026-10-14T03:00:00Z', seven: 91, sevenResetsAt: '2026-10-18T00:00:00Z', workingLanes: 2 });
  ctx.seed.usageSample({ at: '2026-10-14T00:50:00Z', account: 'abcdef012345', five_hour: 30, seven_day: 98, five_hour_resets_at: '2026-10-14T03:00:00Z', seven_day_resets_at: '2026-10-18T00:00:00Z' });

  await main(['capacity', 'broker', '--json']);
  const printed: unknown = JSON.parse(ctx.lines.at(-1) ?? '{}');

  expect(z.object({ reading: z.unknown() }).parse(printed).reading).toStrictEqual({ slot: 2, proof: 'req-9b0c', proofAgeHours: 3, used: 98, resetsAt: '2026-10-18T00:00:00Z', source: "hq login sample on the imp broker slot 2's account, 2026-10-14T00:50:00Z" });
});

test('it keeps the slot read in hq capacity broker when a later capacity sample carries an older usage reading', async () => {
  const ctx = setupTest();
  writeBrokerSlot(ctx.db, { slot: '2', proof: 'req-9b0c', note: undefined, actor: 'z-release', at: new Date('2026-10-13T22:00:00Z') });
  ctx.seed.usageSample({ at: '2026-10-14T00:00:00Z', account: 'abcdef012345', five_hour: 30, seven_day: 98, five_hour_resets_at: '2026-10-14T03:00:00Z', seven_day_resets_at: '2026-10-18T00:00:00Z' });
  ctx.seed.slotUsage({ at: '2026-10-14T00:17:00Z', slot: 2, five: 20, fiveResetsAt: '2026-10-14T03:00:00Z', seven: 91, sevenResetsAt: '2026-10-18T00:00:00Z', workingLanes: 2 });
  await writeCapacitySample(ctx.db, { at: '2026-10-14T00:25:00Z', impd_budget_mib: null, impd_used_mib: null, impd_committed_mib: null, nonnix_awake_mib: null, nonnix_awake_vcpus: null, nix_awake_mib: null, impd_priority_kept_mib: null, cloud_avail_bytes: null, cloud_total_bytes: null, claude_account: 'abcdef012345', claude_five_hour: 30, claude_seven_day: 98, claude_five_hour_resets_at: '2026-10-14T03:00:00Z', claude_seven_day_resets_at: '2026-10-18T00:00:00Z', claude_at: '2026-10-14T00:00:00Z', ci_minutes_today: null, pc_disk_free_bytes: null, pc_mem_avail_bytes: null, op_account_used: null, op_account_limit: null, op_refused: null, errors: {} });

  await main(['capacity', 'broker', '--json']);
  const printed: unknown = JSON.parse(ctx.lines.at(-1) ?? '{}');

  expect(z.object({ reading: z.unknown() }).parse(printed).reading).toStrictEqual({ slot: 2, proof: 'req-9b0c', proofAgeHours: 3, used: 91, resetsAt: '2026-10-18T00:00:00Z', source: 'hq slot read of the imp broker slot 2, 2026-10-14T00:17:00Z' });
});

test("it reads the slot token from hq's own file under ~/.config/hq by default for hq capacity --refresh-slots", async () => {
  const fresh = freshDb();
  const log = console.log;
  const lines: string[] = [];
  onTestFinished(fresh.cleanup);
  updateEnv('HQ_NOW', NOON_SYDNEY);
  updateEnv('HQ_SLOTS_OP_SETTINGS', undefined);
  updateEnv('HOME', fresh.dir);
  onTestFinished(() => (console.log = log));
  const op = createStubOp({ directory: fresh.dir, answers: { 'op://fleet/claude-setup-token-1/credential': 'sk-ant-kettle-home-1', 'op://fleet/claude-setup-token-2/credential': 'sk-ant-kettle-home-2', 'op://fleet/claude-setup-token-3/credential': 'sk-ant-kettle-home-3', 'op://fleet/claude-setup-token-4/credential': 'sk-ant-kettle-home-4' } });
  updateEnv('PATH', `${op.bin}:${process.env['PATH'] ?? ''}`);
  mkdirSync(`${fresh.dir}/.config/hq`, { recursive: true });
  writeFileSync(`${fresh.dir}/.config/hq/slots-op.json`, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'ops_kettle-profile-0002' } }));
  slotUsage.set('Bearer sk-ant-kettle-home-1', { seven: { utilization: 0.4, reset: 1_792_540_800 } });
  slotUsage.set('Bearer sk-ant-kettle-home-2', { seven: { utilization: 0.4, reset: 1_792_368_000 } });
  slotUsage.set('Bearer sk-ant-kettle-home-3', { seven: { utilization: 0.4, reset: 1_792_713_600 } });
  slotUsage.set('Bearer sk-ant-kettle-home-4', { seven: { utilization: 0.4, reset: 1_792_800_000 } });
  console.log = (line: string) => lines.push(line);

  await main(['capacity', '--refresh-slots']);

  expect(readSlotRows(fresh.db, new Date(0), new Date(NOON_SYDNEY)).map((row) => row.slot)).toStrictEqual([1, 2, 3, 4]);
});

test('hq capacity --refresh-slots --json carries the refresh problems in the fleet block', async () => {
  const fresh = freshDb();
  const log = console.log;
  const lines: string[] = [];
  const settings = `${fresh.dir}/settings.local.json`;
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_SLOTS_OP_SETTINGS', settings));
  onTestFinished(() => (console.log = log));
  const op = createStubOp({
    directory: fresh.dir,
    answers: {
      'op://fleet/claude-setup-token-1/credential': 'sk-ant-kettle-cli-1',
      'op://fleet/claude-setup-token-2/credential': 'sk-ant-kettle-cli-2',
      'op://fleet/claude-setup-token-4/credential': 'sk-ant-kettle-cli-4',
    },
  });
  onTestFinished(overrideEnv('PATH', `${op.bin}:${process.env['PATH']}`));
  writeFileSync(settings, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'ops_kettle-profile-0001' } }));
  slotUsage.set('Bearer sk-ant-kettle-cli-1', { seven: { utilization: 0.4, reset: 1_792_540_800 } });
  slotUsage.set('Bearer sk-ant-kettle-cli-2', { seven: { utilization: 0.4, reset: 1_792_540_800 } });
  slotUsage.set('Bearer sk-ant-kettle-cli-4', { seven: { utilization: 0.4, reset: 1_792_540_800 } });
  console.log = (line: string) => lines.push(line);

  await main(['capacity', '--refresh-slots', '--json']);

  const report: unknown = JSON.parse(lines.join('\n'));
  expect(findPath(report, 'fleet', 'problems')).toStrictEqual(['slot 3: op read failed (exit 1)']);
});

test('hq capacity --refresh-slots prints no profile token when op and the slot request fail naming it', async () => {
  const fresh = freshDb();
  const log = console.log;
  const lines: string[] = [];
  const settings = `${fresh.dir}/settings.local.json`;
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_SLOTS_OP_SETTINGS', settings));
  onTestFinished(() => (console.log = log));
  const op = createStubOp({
    directory: fresh.dir,
    answers: {
      'op://fleet/claude-setup-token-2/credential': 'kettle-slot-credential-2',
      'op://fleet/claude-setup-token-3/credential': 'kettle-slot-credential-3',
      'op://fleet/claude-setup-token-4/credential': 'kettle-slot-credential-4',
    },
    failures: { 'op://fleet/claude-setup-token-1/credential': '[ERROR] invented: the vault refused kettle-profile-credential' },
  });
  onTestFinished(overrideEnv('PATH', `${op.bin}:${process.env['PATH']}`));
  writeFileSync(settings, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'kettle-profile-credential' } }));
  server.use(
    http.post(ANTHROPIC_MESSAGES_URL, () => {
      // The interceptor turns only an error with code and errno, as a Node socket error has, into a fetch rejection.
      throw Object.assign(new Error('invented proxy dropped a request minted by kettle-profile-credential'), { code: 'ECONNRESET', errno: -104 });
    }),
  );
  console.log = (line: string) => lines.push(line);

  await main(['capacity', '--refresh-slots']);

  expect(lines.join('\n').split('\n').filter((line) => line.startsWith('  ! '))).toStrictEqual([
    '  ! slot 1: op read failed (exit 1)',
    '  ! slot 2: invented proxy dropped a request minted by [redacted]',
    '  ! slot 3: invented proxy dropped a request minted by [redacted]',
    '  ! slot 4: invented proxy dropped a request minted by [redacted]',
  ]);
  expect(lines.join('\n')).not.toInclude('kettle-profile-credential');
});

test('hq capacity --refresh-slots --json carries neither a slot token nor the profile token when op and the slot requests fail naming them', async () => {
  const fresh = freshDb();
  const log = console.log;
  const lines: string[] = [];
  const settings = `${fresh.dir}/settings.local.json`;
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_SLOTS_OP_SETTINGS', settings));
  onTestFinished(() => (console.log = log));
  const op = createStubOp({
    directory: fresh.dir,
    answers: {
      'op://fleet/claude-setup-token-2/credential': 'kettle-slot-credential-2',
      'op://fleet/claude-setup-token-3/credential': 'kettle-slot-credential-3',
      'op://fleet/claude-setup-token-4/credential': 'kettle-slot-credential-4',
    },
    failures: { 'op://fleet/claude-setup-token-1/credential': '[ERROR] invented: kettle-slot-credential-1 is held back from kettle-profile-credential' },
  });
  const failures: Record<string, string> = {
    'Bearer kettle-slot-credential-2': 'invented proxy dropped kettle-slot-credential-2 minted by kettle-profile-credential',
    'Bearer kettle-slot-credential-3': 'invented proxy dropped kettle-slot-credential-3 minted by kettle-profile-credential',
    'Bearer kettle-slot-credential-4': 'invented proxy dropped kettle-slot-credential-4 minted by kettle-profile-credential',
  };
  onTestFinished(overrideEnv('PATH', `${op.bin}:${process.env['PATH']}`));
  writeFileSync(settings, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'kettle-profile-credential' } }));
  server.use(
    http.post(ANTHROPIC_MESSAGES_URL, (info) => {
      // The interceptor turns only an error with code and errno, as a Node socket error has, into a fetch rejection.
      throw Object.assign(new Error(failures[info.request.headers.get('authorization') ?? '']), { code: 'ECONNRESET', errno: -104 });
    }),
  );
  console.log = (line: string) => lines.push(line);

  await main(['capacity', '--refresh-slots', '--json']);

  const output = lines.join('\n');
  expect(findPath(JSON.parse(output), 'fleet', 'problems')).toStrictEqual([
    'slot 1: op read failed (exit 1)',
    'slot 2: invented proxy dropped [redacted] minted by [redacted]',
    'slot 3: invented proxy dropped [redacted] minted by [redacted]',
    'slot 4: invented proxy dropped [redacted] minted by [redacted]',
  ]);
  expect(output).not.toInclude('kettle-slot-credential');
  expect(output).not.toInclude('kettle-profile-credential');
});

test('hq capacity --refresh-slots stores neither a slot token nor the profile token when the answers and an op error carry them', async () => {
  const fresh = freshDb();
  const log = console.log;
  const settings = `${fresh.dir}/settings.local.json`;
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_SLOTS_OP_SETTINGS', settings));
  onTestFinished(() => (console.log = log));
  const op = createStubOp({
    directory: fresh.dir,
    answers: {
      'op://fleet/claude-setup-token-2/credential': 'kettle-slot-credential-2',
      'op://fleet/claude-setup-token-3/credential': 'kettle-slot-credential-3',
      'op://fleet/claude-setup-token-4/credential': 'kettle-slot-credential-4',
    },
    failures: { 'op://fleet/claude-setup-token-1/credential': '[ERROR] invented: kettle-slot-credential-1 is held back from kettle-profile-credential' },
  });
  const answers: Record<string, Response> = {
    'Bearer kettle-slot-credential-2': HttpResponse.json(
      { type: 'error', error: { type: 'rate_limit_error', message: 'invented limit for kettle-slot-credential-2 minted by kettle-profile-credential' } },
      { status: 429, headers: { 'x-invented-echo': 'kettle-slot-credential-2 kettle-profile-credential', 'anthropic-ratelimit-unified-7d-utilization': '1', 'anthropic-ratelimit-unified-7d-reset': 'kettle-profile-credential' } },
    ),
    'Bearer kettle-slot-credential-3': HttpResponse.json(
      { id: 'msg_invented0002', type: 'message', role: 'assistant', model: 'claude-haiku-4-5', content: [{ type: 'text', text: 'kettle-profile-credential' }], stop_reason: 'max_tokens', stop_sequence: null, usage: { input_tokens: 8, output_tokens: 1 } },
      { headers: { 'x-invented-echo': 'kettle-slot-credential-3 kettle-profile-credential', 'anthropic-ratelimit-unified-5h-utilization': 'kettle-profile-credential', 'anthropic-ratelimit-unified-5h-reset': 'kettle-slot-credential-3', 'anthropic-ratelimit-unified-7d-utilization': '0.4', 'anthropic-ratelimit-unified-7d-reset': '1792540800' } },
    ),
    'Bearer kettle-slot-credential-4': HttpResponse.json(
      { type: 'error', error: { type: 'authentication_error', message: 'invented refusal of kettle-slot-credential-4 minted by kettle-profile-credential' } },
      { status: 401, headers: { 'x-invented-echo': 'kettle-slot-credential-4 kettle-profile-credential' } },
    ),
  };
  onTestFinished(overrideEnv('PATH', `${op.bin}:${process.env['PATH']}`));
  writeFileSync(settings, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'kettle-profile-credential' } }));
  server.use(http.post(ANTHROPIC_MESSAGES_URL, (info) => answers[info.request.headers.get('authorization') ?? '']));
  console.log = () => {};

  await main(['capacity', '--refresh-slots']);

  const tables = z.array(z.object({ name: z.string() })).parse(fresh.db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all());
  const stored = tables.map((table) => ({ table: table.name, rows: JSON.stringify(fresh.db.query(`SELECT * FROM "${table.name}"`).all()) }));
  expect(readSlotRows(fresh.db, new Date(0), new Date(NOON_SYDNEY)).map((row) => ({ slot: row.slot, status: row.status, five: row.five, fiveResetsAt: row.fiveResetsAt, seven: row.seven, sevenResetsAt: row.sevenResetsAt }))).toStrictEqual([
    { slot: 1, status: 'op-failed', five: null, fiveResetsAt: null, seven: null, sevenResetsAt: null },
    { slot: 2, status: '429', five: null, fiveResetsAt: null, seven: 100, sevenResetsAt: null },
    { slot: 3, status: '200', five: null, fiveResetsAt: null, seven: 40, sevenResetsAt: '2026-10-21T00:00:00Z' },
    { slot: 4, status: '401', five: null, fiveResetsAt: null, seven: null, sevenResetsAt: null },
  ]);
  expect(stored.length).toBeGreaterThan(1);
  expect(stored.filter((table) => table.rows.includes('kettle-slot-credential') || table.rows.includes('kettle-profile-credential'))).toStrictEqual([]);
});

test('hq lanes tick --refresh reads Ready from Linear inside the 10 min throttle, then ticks', async () => {
  const fresh = freshDb();
  const run = mock<Runner>(() => Promise.resolve<RunResult>({ code: 0, stdout: 'lin_api_INVENTEDkettleKEY0042\n', stderr: '' }));
  const log = console.log;
  const printed: string[] = [];
  onTestFinished(fresh.cleanup);
  resetKey();
  onTestFinished(resetKey);
  onTestFinished(overrideEnv('OP_SERVICE_ACCOUNT_TOKEN', 'invented-token'));
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_AS', 'kettle-lanes'));
  onTestFinished(overrideEnv('HQ_CAPACITY', `${fresh.dir}/defs/scripts/capacity.sh`));
  console.log = (line: string) => void printed.push(line);
  onTestFinished(() => (console.log = log));
  mkdirSync(`${fresh.dir}/defs/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/defs/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/defs/pacing.json`, JSON.stringify({ slots: { imp: 2, local: 2 } }));
  setMeta(fresh.db, 'lanes_ready_linear_at', '2026-10-14T00:58:00Z');
  linearIssues.push({ identifier: 'GEO-9861', team: 'GEO', state: 'Ready', stateType: 'unstarted', previousIdentifiers: [], project: null, labels: [], parent: null });

  const code = await main(['lanes', 'tick', '--refresh'], run);

  expect(code).toBe(0);
  expect(printed.join('\n')).toBe('Read Ready from Linear.\n1 slot(s) free (0 MiB); free for 0 min, under 10');
  expect(readReadySnapshot(fresh.db, new Date(NOON_SYDNEY))?.eligible.map((issue) => issue.identifier)).toStrictEqual(['GEO-9861']);
});

test('it leaves a Ready issue out of the snapshot while its blocker is not Done, through the real Linear client', async () => {
  const fresh = freshDb();
  const run = mock<Runner>(() => Promise.resolve<RunResult>({ code: 0, stdout: 'lin_api_INVENTEDkettleKEY0042\n', stderr: '' }));
  const log = console.log;
  const printed: string[] = [];
  onTestFinished(fresh.cleanup);
  resetKey();
  onTestFinished(resetKey);
  onTestFinished(overrideEnv('OP_SERVICE_ACCOUNT_TOKEN', 'invented-token'));
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_AS', 'kettle-lanes'));
  onTestFinished(overrideEnv('HQ_CAPACITY', `${fresh.dir}/defs/scripts/capacity.sh`));
  console.log = (line: string) => void printed.push(line);
  onTestFinished(() => (console.log = log));
  mkdirSync(`${fresh.dir}/defs/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/defs/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/defs/pacing.json`, JSON.stringify({ slots: { imp: 2, local: 2 } }));
  setMeta(fresh.db, 'lanes_ready_linear_at', '2026-10-14T00:58:00Z');
  linearIssues.push(
    { identifier: 'GEO-9860', team: 'GEO', state: 'In Progress', stateType: 'started', previousIdentifiers: [], project: null, labels: [], parent: null },
    { identifier: 'GEO-9861', team: 'GEO', state: 'Ready', stateType: 'unstarted', previousIdentifiers: [], project: null, labels: [], parent: null },
    { identifier: 'GEO-9862', team: 'GEO', state: 'Ready', stateType: 'unstarted', previousIdentifiers: [], project: null, labels: [], parent: null, blockedBy: ['GEO-9860'] },
  );

  const code = await main(['lanes', 'tick', '--refresh'], run);

  expect(code).toBe(0);
  expect(readReadySnapshot(fresh.db, new Date(NOON_SYDNEY))?.eligible.map((issue) => issue.identifier)).toStrictEqual(['GEO-9861']);
});

test('hq lanes tick --refresh reports a failed Ready read, still ticks, and exits 0', async () => {
  const fresh = freshDb();
  const run = mock<Runner>(() => Promise.resolve<RunResult>({ code: 0, stdout: 'lin_api_INVENTEDkettleKEY0042\n', stderr: '' }));
  const log = console.log;
  const printed: string[] = [];
  onTestFinished(fresh.cleanup);
  resetKey();
  onTestFinished(resetKey);
  onTestFinished(overrideEnv('OP_SERVICE_ACCOUNT_TOKEN', 'invented-token'));
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_AS', 'kettle-lanes'));
  onTestFinished(overrideEnv('HQ_CAPACITY', `${fresh.dir}/defs/scripts/capacity.sh`));
  console.log = (line: string) => void printed.push(line);
  onTestFinished(() => (console.log = log));
  mkdirSync(`${fresh.dir}/defs/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/defs/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/defs/pacing.json`, JSON.stringify({ slots: { imp: 2, local: 2 } }));
  server.use(http.post(LINEAR_GRAPHQL_URL, () => HttpResponse.text('invented kettle maintenance', { status: 503 })));

  const code = await main(['lanes', 'tick', '--refresh'], run);

  expect(code).toBe(0);
  expect(printed.join('\n')).toBe('Ready read from Linear failed: Linear answered 503: no data\n2 slot(s) free (0 MiB); free for 0 min, under 10');
});

test('hq run final refuses a sha that is no commit of the PR and records no FINAL', async () => {
  const fresh = freshDb();
  const printed: string[] = [];
  const log = console.log;
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_AS', 'z-delivery'));
  console.log = (line: string) => void printed.push(line);
  onTestFinished(() => (console.log = log));
  addRun(fresh.db, { issue: 'GEO-9731', title: 'Invented kettle work', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' });
  addPr(fresh.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const run = buildStubFinalGH({ commits: [`44238662${buildMockSha(2).slice(8)}`] }, []);

  const code = await main(['run', 'final', 'kettle#714', '--sha', '4423866e', '--json'], run);

  expect(code).toBe(1);
  expect(JSON.parse(printed.join('\n'))).toStrictEqual({
    ok: false,
    error: { code: 'bad_args', message: 'the FINAL names 4423866e, which is no commit of zgeoff/kettle#714; its head is 44238662 - send the FINAL again at that sha' },
  });
  expect(fresh.db.query(`SELECT final_sha FROM run_prs WHERE ref = 'kettle#714'`).get()).toStrictEqual({ final_sha: null });
});

test('hq run note keeps a note whose FINAL is no commit of the PR, records no FINAL, and queues the refusal', async () => {
  const fresh = freshDb();
  const log = console.log;
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('HQ_AS', 'z-delivery'));
  console.log = () => {};
  onTestFinished(() => (console.log = log));
  addRun(fresh.db, { issue: 'GEO-9731', title: 'Invented kettle work', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' });
  addPr(fresh.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const run = buildStubFinalGH({ commits: [`44238662${buildMockSha(2).slice(8)}`] }, []);

  const code = await main(['run', 'note', 'GEO-9731', 'FINAL kettle#714 4423866e all green', '--json'], run);

  expect(code).toBe(0);
  expect(fresh.db.query(`SELECT text FROM run_notes WHERE issue = 'GEO-9731'`).all()).toStrictEqual([{ text: 'FINAL kettle#714 4423866e all green' }]);
  expect(fresh.db.query(`SELECT final_sha FROM run_prs WHERE ref = 'kettle#714'`).get()).toStrictEqual({ final_sha: null });
  expect(fresh.db.query(`SELECT target, text FROM outbox WHERE target != 'z-review'`).all()).toStrictEqual([
    { target: 'z-delivery', text: 'GEO-9731: the FINAL names 4423866e, which is no commit of zgeoff/kettle#714; its head is 44238662 - send the FINAL again at that sha' },
  ]);
});

test('it creates no hq db when hq brief runs and there is none', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const directory = join(fresh.dir, 'absent');
  const log = console.log;
  const error = console.error;
  console.log = () => {};
  console.error = () => {};
  onTestFinished(() => {
    console.log = log;
    console.error = error;
  });
  onTestFinished(overrideEnv('HQ_DB', join(directory, 'hq.db')));

  await main(['brief', 'GEO-9001', '--json'], buildStubBriefGH({ commits: {}, files: {} }, []));

  expect(existsSync(directory)).toBe(false);
});

test('it routes hq brief check to the measure of a finished brief, and opens no hq db', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const printed: string[] = [];
  const spy = spyOn(console, 'log').mockImplementation((line: string) => void printed.push(line));
  onTestFinished(() => spy.mockRestore());
  onTestFinished(overrideEnv('HQ_DB', join(fresh.dir, 'absent', 'hq.db')));
  writeFileSync(join(fresh.dir, 'brief.txt'), '/goal A kettle that boils.');

  const code = await main(['brief', 'check', join(fresh.dir, 'brief.txt')], buildStubBriefGH({ commits: {}, files: {} }, []));

  expect(code).toBe(0);
  expect(printed).toStrictEqual(['ok: 26 bytes']);
  expect(existsSync(join(fresh.dir, 'absent'))).toBe(false);
});

test('it refuses an hq review --effort that is neither medium nor high on a noslop repo, before it reviews', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const settings = updateNoslopRepos(fresh.db, 'on', ['widgets']);
  writeNoslopSettings(fresh.db, { ...settings, sha: buildMockSha(3) });
  const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), 'review', 'widgets', '7', '--effort', 'kettle', '--json'], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY } });

  const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);

  expect(code).toBe(1);
  expect(JSON.parse(stdout)).toStrictEqual({ ok: false, error: { code: 'bad_args', message: '--effort must be medium or high' } });
  expect(fresh.db.query('SELECT COUNT(*) AS count FROM noslop_rounds').get()).toStrictEqual({ count: 0 });
});

test.each([
  ['queued', ['kettle-mint']],
  ['all', ['kettle-mint']],
  ['bogus,queued', ['kettle-mint']],
  ['open', []],
  ['bogus', []],
])('it lists the asks that hq call list --state %s names', async (state, expected) => {
  const ctx = setupTest();
  await main(['call', 'add', 'kettle-mint', '--title', 'Mint the kettle', '--question', 'Mint the kettle tokens?', '--body', 'Details.', '--json']);
  ctx.lines.length = 0;

  await main(['call', 'list', '--state', state, '--json']);

  const listed = z.object({ id: z.string() });
  const listing = z.object({ calls: z.array(listed) });
  const printed = listing.parse(JSON.parse(ctx.lines[0] ?? '{}'));
  expect(printed.calls.map((row) => row.id)).toStrictEqual(expected);
});

test('it records a review wait with hq run review-wait on the FINAL, and hq run show names it until the date passes', async () => {
  const ctx = setupTest();
  updateEnv('HQ_AS', 'z-delivery');
  ctx.seed.run({ issue: 'GEO-9741' });
  ctx.seed.finalRunPR({ issue: 'GEO-9741', ref: 'kettle#741', sha: 'abc1234' });

  const code = await main(['run', 'review-wait', 'kettle#741', '--until', '2026-10-16T01:00:00Z', '--reason', 'the only reviewer is out of quota']);
  const waited = ctx.lines.join('\n');
  ctx.lines.length = 0;
  await main(['run', 'show', 'GEO-9741']);
  const shownBefore = ctx.lines.join('\n');
  ctx.lines.length = 0;
  at('2026-10-16T01:00:00Z');
  await main(['run', 'show', 'GEO-9741']);

  expect({ code, waited }).toStrictEqual({ code: 0, waited: '| no session | GEO-9741 Invented kettle work [working] | kettle#741 final abc1234 | Agent working. |' });
  expect(shownBefore).toInclude('  kettle#741 review waits until Fri 16 Oct 12:00 Sydney (the only reviewer is out of quota)');
  expect(ctx.lines.join('\n')).not.toInclude('review waits');
  const stored = requirePR(ctx.db, 'kettle#741');
  expect({ until: stored.review_wait_until, sha: stored.review_wait_sha }).toStrictEqual({ until: '2026-10-16T01:00:00Z', sha: 'abc1234' });
});

test('it hides a review wait from hq run show once a new FINAL at another head is recorded', async () => {
  const ctx = setupTest();
  updateEnv('HQ_AS', 'z-delivery');
  ctx.seed.run({ issue: 'GEO-9748' });
  ctx.seed.finalRunPR({ issue: 'GEO-9748', ref: 'kettle#748', sha: 'abc1234' });
  const code = await main(['run', 'review-wait', 'kettle#748', '--until', '2026-10-16T01:00:00Z', '--reason', 'the only reviewer is out of quota']);
  const waited = ctx.lines.join('\n');
  const head = `def56789${buildMockSha(3).slice(8)}`;
  await main(['run', 'final', 'kettle#748', '--sha', head], buildStubFinalGH({ commits: [head] }, []));
  ctx.lines.length = 0;

  await main(['run', 'show', 'GEO-9748']);

  expect({ code, waited }).toStrictEqual({ code: 0, waited: '| no session | GEO-9748 Invented kettle work [working] | kettle#748 final abc1234 | Agent working. |' });
  expect(ctx.lines.join('\n')).toBe(`| no session | GEO-9748 Invented kettle work [working] | kettle#748 final ${head.slice(0, 7)} | Agent working. |`);
});

test.each([
  { name: 'a PR no run has', args: ['kettle#999', '--until', '2026-10-16T01:00:00Z', '--reason', 'out of quota'], message: /no PR kettle#999/u },
  { name: 'a PR with no FINAL', args: ['kettle#742', '--until', '2026-10-16T01:00:00Z', '--reason', 'out of quota'], message: /kettle#742 has no FINAL/u },
  { name: 'a PR that is not open', args: ['kettle#743', '--until', '2026-10-16T01:00:00Z', '--reason', 'out of quota'], message: /kettle#743 is merged, not open/u },
  { name: 'a time that has passed', args: ['kettle#744', '--until', '2026-10-13T01:00:00Z', '--reason', 'out of quota'], message: /has passed/u },
  { name: 'no reason', args: ['kettle#744', '--until', '2026-10-16T01:00:00Z'], message: /--reason is required/u },
])('it refuses hq run review-wait for $name and records no wait', async (row) => {
  const ctx = setupTest();
  updateEnv('HQ_AS', 'z-delivery');
  ctx.seed.run({ issue: 'GEO-9742' });
  ctx.seed.runPR({ issue: 'GEO-9742', ref: 'kettle#742' });
  ctx.seed.run({ issue: 'GEO-9743' });
  ctx.seed.mergedRunPR({ issue: 'GEO-9743', ref: 'kettle#743' });
  ctx.seed.run({ issue: 'GEO-9744' });
  ctx.seed.finalRunPR({ issue: 'GEO-9744', ref: 'kettle#744' });

  const code = await main(['run', 'review-wait', ...row.args, '--json']);

  expect(code).toBe(1);
  expect(ctx.lines.join('\n')).toMatch(row.message);
  expect(requirePR(ctx.db, 'kettle#744').review_wait_until).toBeNull();
});

test('it removes the review wait with hq run review-wait --clear', async () => {
  const ctx = setupTest();
  updateEnv('HQ_AS', 'z-delivery');
  ctx.seed.run({ issue: 'GEO-9745' });
  ctx.seed.finalRunPR({ issue: 'GEO-9745', ref: 'kettle#745' });
  await main(['run', 'review-wait', 'kettle#745', '--until', '2026-10-16T01:00:00Z', '--reason', 'out of quota']);

  const code = await main(['run', 'review-wait', 'kettle#745', '--clear']);

  expect(code).toBe(0);
  const stored = requirePR(ctx.db, 'kettle#745');
  expect({ until: stored.review_wait_until, sha: stored.review_wait_sha, reason: stored.review_wait_reason }).toStrictEqual({ until: null, sha: null, reason: null });
});

test.each([
  { name: '--until', args: ['--until', '2026-10-17T01:00:00Z'] },
  { name: '--reason', args: ['--reason', 'the reviewer is back'] },
])('it refuses hq run review-wait --clear with $name and keeps the wait', async (row) => {
  const ctx = setupTest();
  updateEnv('HQ_AS', 'z-delivery');
  ctx.seed.run({ issue: 'GEO-9747' });
  ctx.seed.finalRunPR({ issue: 'GEO-9747', ref: 'kettle#747' });
  await main(['run', 'review-wait', 'kettle#747', '--until', '2026-10-16T01:00:00Z', '--reason', 'out of quota']);
  ctx.lines.length = 0;

  const code = await main(['run', 'review-wait', 'kettle#747', '--clear', ...row.args, '--json']);
  const printed: unknown = JSON.parse(ctx.lines.join('\n'));

  expect({ code, printed }).toStrictEqual({
    code: 1,
    printed: { ok: false, error: { code: 'bad_args', message: 'give --clear alone, or --until with --reason, not both' } },
  });
  expect(requirePR(ctx.db, 'kettle#747').review_wait_until).toBe('2026-10-16T01:00:00Z');
});

test('it reports the review wait in hq run show --json only while it is active', async () => {
  const ctx = setupTest();
  updateEnv('HQ_AS', 'z-delivery');
  ctx.seed.run({ issue: 'GEO-9746' });
  ctx.seed.finalRunPR({ issue: 'GEO-9746', ref: 'kettle#746', sha: 'abc1234' });
  await main(['run', 'review-wait', 'kettle#746', '--until', '2026-10-16T01:00:00Z', '--reason', 'out of quota']);

  ctx.lines.length = 0;
  await main(['run', 'show', 'GEO-9746', '--json']);
  const before = ctx.lines.join('\n');
  ctx.lines.length = 0;
  at('2026-10-16T01:00:00Z');
  await main(['run', 'show', 'GEO-9746', '--json']);
  const after = ctx.lines.join('\n');

  expect(before).toMatch(/"review_wait": \{\s+"until": "2026-10-16T01:00:00Z",\s+"reason": "out of quota"\s+\}/u);
  expect(after).toInclude('"review_wait": null');
});

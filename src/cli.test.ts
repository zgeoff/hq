import type { Database } from 'bun:sqlite';
import { expect, mock, onTestFinished, test } from 'bun:test';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpResponse, http } from 'msw';
import { z } from 'zod';
import rulesTable from '../lanes.json';
import { ANTHROPIC_MESSAGES_URL, slotUsage } from '../mocks/anthropic-handlers.ts';
import { LINEAR_GRAPHQL_URL, linearIssues } from '../mocks/linear-handlers.ts';
import { server } from '../mocks/node.ts';
import { createStubOp } from '../test/create-stub-op.ts';
import { NOON_SYDNEY, at, fakeAtc, freshDb } from '../test/helpers.ts';
import { main } from './cli.ts';
import { overrideEnv } from './config/override-env.ts';
import { setMeta } from './db/set-meta.ts';
import { loadActionsSpend } from './goals/load-actions-spend.ts';
import { createGrantMark } from './grants/create-grant-mark.ts';
import { recordGrantAction } from './grants/record-grant-action.ts';
import { readReadySnapshot } from './lanes/read-ready-snapshot.ts';
import { resetKey } from './linear/reset-key.ts';
import type { RunResult, Runner } from './runner/types.ts';
import { addPr } from './runs/add-pr.ts';
import { addRun } from './runs/add-run.ts';
import { setState } from './runs/set-state.ts';

// A database at noon Sydney, quiet notices and console, and a stand-in gh on PATH for
// `hq goals sync`: no repos and no closed PRs, with `billing` as the billing usage call's commands.
function setupTest(billing: string): Database {
  const fresh = freshDb(),
    log = console.log,
    path0 = process.env['PATH'],
    stubBin = `${fresh.dir}/bin`;
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOW', NOON_SYDNEY));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  console.log = () => {};
  onTestFinished(() => (console.log = log));
  mkdirSync(stubBin);
  writeFileSync(`${stubBin}/gh`, ['#!/bin/sh', 'case "$*" in', `  *settings/billing/usage*) ${billing} ;;`, '  "repo "*) echo "[]" ;;', '  *) echo \'[{"total_count":0,"incomplete_results":false,"items":[]}]\' ;;', 'esac', ''].join('\n'));
  chmodSync(`${stubBin}/gh`, 0o755);
  process.env['PATH'] = `${stubBin}:${path0}`;
  onTestFinished(() => (process.env['PATH'] = path0));
  return fresh.db;
}

test("hq goals sync stores the month's Actions spend from GitHub billing", async () => {
  const db = setupTest(`echo '{"usageItems":[{"product":"actions","netAmount":12.5}]}'`);
  await main(['goals', 'sync', '--days', '1', '--json']);

  expect(loadActionsSpend(db, new Date(NOON_SYDNEY))).toBe(12.5);
});

test('hq goals sync replaces an earlier good Actions spend with unknown when gh fails', async () => {
  const db = setupTest(`echo 'HTTP 403' >&2; exit 1`);
  setMeta(db, 'actions_spend', JSON.stringify({ at: '2026-10-14T00:50:00Z', month: '2026-10', net: 4 }));
  await main(['goals', 'sync', '--days', '1', '--json']);

  expect(loadActionsSpend(db, new Date(NOON_SYDNEY))).toBeNull();
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

test('it refuses hq run add --design agent above the agent count', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/skill/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/skill/pacing.json`, JSON.stringify({ slots: { imp: 2, local: 2 }, designSlots: 1, agentDesignSlots: 1 }));
  const hq = async (...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
    const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), ...args, '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_PROJECTS: `${fresh.dir}/projects`, HQ_CAPACITY: `${fresh.dir}/skill/scripts/capacity.sh`, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY, HQ_AS: 'z-delivery', PATH: `${fresh.dir}/bin:${process.env['PATH']}` },
    });
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    return { code, stdout, stderr };
  };
  at(NOON_SYDNEY);
  addRun(fresh.db, { issue: 'GEO-9951', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });

  const over = await hq('run', 'add', 'GEO-9952', '--title', 'Design the kettle lid', '--design', 'agent');

  expect(over.code).toBe(1);
  expect(over.stderr + over.stdout).toInclude('GEO-9952: all 1 agent design passes are open (GEO-9951)');
});

test('it adds a with-geoff pass above the count through hq run add --asked', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/skill/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/skill/pacing.json`, JSON.stringify({ slots: { imp: 2, local: 2 }, designSlots: 1, agentDesignSlots: 1 }));
  const hq = async (...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
    const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), ...args, '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_PROJECTS: `${fresh.dir}/projects`, HQ_CAPACITY: `${fresh.dir}/skill/scripts/capacity.sh`, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY, HQ_AS: 'z-delivery', PATH: `${fresh.dir}/bin:${process.env['PATH']}` },
    });
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    return { code, stdout, stderr };
  };
  at(NOON_SYDNEY);
  addRun(fresh.db, { issue: 'GEO-9953', title: 'Design the whistle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'with-geoff', actor: 'z-delivery' });

  const asked = await hq('run', 'add', 'GEO-9954', '--title', 'Design the handle', '--design', 'with-geoff', '--asked', 'chat 29 Oct');

  expect(asked.code).toBe(0);
  expect(JSON.parse(asked.stdout)).toMatchObject({ run: { issue: 'GEO-9954', design_lane: 'with-geoff' } });
});

test('it shows the design lanes apart from the delivery pool in hq lanes --json', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/skill/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/skill/pacing.json`, JSON.stringify({ slots: { imp: 2, local: 2 }, designSlots: 1, agentDesignSlots: 1 }));
  const hq = async (...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
    const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), ...args, '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_PROJECTS: `${fresh.dir}/projects`, HQ_CAPACITY: `${fresh.dir}/skill/scripts/capacity.sh`, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY, HQ_AS: 'z-delivery', PATH: `${fresh.dir}/bin:${process.env['PATH']}` },
    });
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    return { code, stdout, stderr };
  };
  at(NOON_SYDNEY);
  addRun(fresh.db, { issue: 'GEO-9951', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  addRun(fresh.db, { issue: 'GEO-9953', title: 'Design the whistle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'with-geoff', actor: 'z-delivery' });
  addRun(fresh.db, { issue: 'GEO-9954', title: 'Design the handle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'with-geoff', asked: 'chat 29 Oct', actor: 'z-delivery' });

  const lanes = await hq('lanes');

  expect(JSON.parse(lanes.stdout)).toMatchObject({ plan: { pool: { impRunning: 0, localRunning: 0 }, design: { agent: { open: 1, slots: 1 }, withGeoff: { open: 2, slots: 1, asked: ['chat 29 Oct'] } } } });
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

test('it keeps the design pass in hq run show after the build run starts', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/skill/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/skill/pacing.json`, JSON.stringify({ slots: { imp: 2, local: 2 }, designSlots: 1, agentDesignSlots: 1 }));
  const hq = async (...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
    const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), ...args, '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_PROJECTS: `${fresh.dir}/projects`, HQ_CAPACITY: `${fresh.dir}/skill/scripts/capacity.sh`, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY, HQ_AS: 'z-delivery', PATH: `${fresh.dir}/bin:${process.env['PATH']}` },
    });
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    return { code, stdout, stderr };
  };
  at(NOON_SYDNEY);
  addRun(fresh.db, { issue: 'GEO-9951', title: 'Design the kettle spout', place: 'local', session: 'a0000051-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  setState(fresh.db, 'GEO-9951', 'dropped', { note: 'design settled elsewhere' }, 'z-delivery');
  addRun(fresh.db, { issue: 'GEO-9951', title: 'Build the kettle spout', place: 'local', session: 'a0000052-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });

  const shown = await hq('run', 'show', 'GEO-9951');

  expect(JSON.parse(shown.stdout)).toMatchObject({
    run: { issue: 'GEO-9951', design_lane: null, state: 'working', sessions: [{ session_id: 'a0000052-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, { session_id: 'a0000051-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 0 }] },
    designPass: [{ designLane: 'agent', designSessions: ['a0000051-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] }],
  });
});

test('it refuses hq run add --design while pacing.json gets a design count wrong', async () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  mkdirSync(`${fresh.dir}/bin`);
  writeFileSync(`${fresh.dir}/bin/systemctl`, '#!/bin/sh\nexit 3\n');
  chmodSync(`${fresh.dir}/bin/systemctl`, 0o755);
  mkdirSync(`${fresh.dir}/skill/scripts`, { recursive: true });
  writeFileSync(`${fresh.dir}/skill/scripts/capacity.sh`, `echo '${JSON.stringify({ imp: { freeMib: 0, room: false } })}'\n`);
  writeFileSync(`${fresh.dir}/skill/pacing.json`, JSON.stringify({ slots: { imp: 2, local: 2 }, agentDesignSlots: 'two' }));
  const hq = async (...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
    const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), ...args, '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_PROJECTS: `${fresh.dir}/projects`, HQ_CAPACITY: `${fresh.dir}/skill/scripts/capacity.sh`, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY, HQ_AS: 'z-delivery', PATH: `${fresh.dir}/bin:${process.env['PATH']}` },
    });
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    return { code, stdout, stderr };
  };

  const refused = await hq('run', 'add', 'GEO-9955', '--title', 'Design the kettle spout', '--design', 'agent');

  expect(refused.code).toBe(1);
  expect(refused.stderr + refused.stdout).toInclude('pacing.json designSlots and agentDesignSlots: give each a whole number from 0 to 100; hq adds no design pass until pacing.json gives its counts');
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
  const atc = fakeAtc(fresh.dir, [
    { id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' },
    { id: '0000a003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'teapot-agent', alive: true, state: 'done' },
  ]);
  onTestFinished(atc.stop);
  addRun(fresh.db, { issue: 'GEO-9821', title: 'Invented kettle descaler', place: 'local', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });

  const code = await main(['run', 'done', 'GEO-9821', '--json']);

  expect(code).toBe(0);
  expect(JSON.parse(printed.join('\n')).wrapUp).toStrictEqual({ forgotten: ['0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], destroyed: [], kept: [], failed: [] });
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
  setMeta(fresh.db, 'lanes_slot_cause_since', JSON.stringify({ cause: 'triage', since: '2026-10-14T00:40:00Z' }));
  fresh.db.query("INSERT INTO slot_minutes (day, cause, minutes) VALUES ('2026-10-14', 'delivery', 12.4), ('2026-10-14', 'triage', 40.6), ('2026-10-13', 'supply', 99)").run();
  const hq = async (...args: string[]): Promise<string> => {
    const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), 'lanes', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_PROJECTS: `${fresh.dir}/projects`, HQ_CAPACITY: `${fresh.dir}/skill/scripts/capacity.sh`, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY, HQ_AS: 'z-delivery', PATH: `${fresh.dir}/bin:${process.env['PATH']}` },
    });
    const [, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    return stdout;
  };

  const text = await hq();
  const json = await hq('--json');

  expect(text).toInclude('cause: triage, 2 free slot(s) since 2026-10-14T00:40:00Z');
  expect(text).toInclude('empty slot-minutes today (Sydney): delivery 12, triage 41, supply 0');
  expect(JSON.parse(json).slotCauses).toStrictEqual({
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

  expect(JSON.parse(stdout).cap).toStrictEqual({ cap: 1, until: '2026-10-18T21:00:00Z', reason: 'weekend pacing', by: 'z-stu', working: 0, limitedBy: 'cap', workingFrom: 'runs' });
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
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const insert = fresh.db.query('INSERT INTO usage_samples (at, account, five_hour, seven_day) VALUES (?, ?, ?, ?)');
  insert.run('2026-10-14T00:30:00Z', 'kettle01', 10, 20);
  insert.run('2026-10-14T01:00:00Z', 'kettle01', 12, 22);
  const child = Bun.spawn(['bun', join(import.meta.dir, 'cli.ts'), 'capacity', 'show', '--json'], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, HOME: fresh.dir, HQ_DB: fresh.path, HQ_NOTIFY: 'off', HQ_NOW: NOON_SYDNEY } });

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
  recordGrantAction(fresh.db, { grant: 'kettle-merges', target: 'kettle#8', note: null, actor: 'teapot-bot' });
  recordGrantAction(fresh.db, { grant: 'kettle-merges', target: 'kettle#9', note: null, actor: 'teapot-bot' });
  fresh.db.query("UPDATE grant_actions SET voided_at = '2026-10-14T01:30:00Z', voided_by = 'z-stu', void_reason = 'logged before the merge failed' WHERE id = 1").run();
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
  expect(JSON.parse(json).grants[0].voided).toStrictEqual([{ id: 1, target: 'kettle#8', note: null, actor: 'teapot-bot', at: NOON_SYDNEY, voidedAt: '2026-10-14T01:30:00Z', voidedBy: 'z-stu', voidReason: 'logged before the merge failed' }]);
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
  expect(JSON.parse(lines[1] ?? '{}').fleet).toMatchObject({ notSetUp: expect.stringContaining('no settings file at '), active: null, slots: [], forecast: null, note: 'slot reads are not set up' });
});

test('hq capacity --refresh-slots reads the three slots through op and prints the fleet block without a token', async () => {
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
      'op://claude-slots/claude-setup-token-1/credential': 'sk-ant-kettle-cli-1',
      'op://claude-slots/claude-setup-token-2/credential': 'sk-ant-kettle-cli-2',
      'op://claude-slots/claude-setup-token-3/credential': 'sk-ant-kettle-cli-3',
    },
  });
  onTestFinished(overrideEnv('PATH', `${op.bin}:${process.env['PATH']}`));
  writeFileSync(settings, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'ops_kettle-profile-0001' } }));
  fresh.db.query('INSERT INTO usage_samples (at, account, five_hour, seven_day, five_hour_resets_at, seven_day_resets_at) VALUES (?, ?, ?, ?, ?, ?)').run('2026-10-14T00:55:00Z', 'abcdef012345', 5, 40, null, '2026-10-19T00:00:00Z');
  slotUsage.set('Bearer sk-ant-kettle-cli-1', { seven: { utilization: 0.4, reset: 1_792_540_800 } });
  slotUsage.set('Bearer sk-ant-kettle-cli-2', { seven: { utilization: 0.4, reset: 1_792_368_000 } });
  slotUsage.set('Bearer sk-ant-kettle-cli-3', { seven: { utilization: 0.4, reset: 1_792_713_600 } });
  console.log = (line: string) => lines.push(line);

  await main(['capacity', '--refresh-slots']);

  const text = lines.join('\n');
  expect(text).toInclude('  slot 2 (active): 5h ?, 7d 40% (resets 19 Oct 00:00Z), read 0 min ago');
  expect(text).toInclude('  slot 1: 5h ?, 7d 40% (resets 21 Oct 00:00Z), read 0 min ago');
  expect(text).not.toInclude('sk-ant-kettle');
  expect(fresh.db.query('SELECT COUNT(*) AS total FROM slot_usage').get()).toStrictEqual({ total: 3 });
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
      'op://claude-slots/claude-setup-token-1/credential': 'sk-ant-kettle-cli-1',
      'op://claude-slots/claude-setup-token-2/credential': 'sk-ant-kettle-cli-2',
    },
  });
  onTestFinished(overrideEnv('PATH', `${op.bin}:${process.env['PATH']}`));
  writeFileSync(settings, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'ops_kettle-profile-0001' } }));
  slotUsage.set('Bearer sk-ant-kettle-cli-1', { seven: { utilization: 0.4, reset: 1_792_540_800 } });
  slotUsage.set('Bearer sk-ant-kettle-cli-2', { seven: { utilization: 0.4, reset: 1_792_540_800 } });
  console.log = (line: string) => lines.push(line);

  await main(['capacity', '--refresh-slots', '--json']);

  expect(JSON.parse(lines.join('\n')).fleet.problems).toStrictEqual(['slot 3: op read failed (exit 1)']);
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
      'op://claude-slots/claude-setup-token-2/credential': 'kettle-slot-credential-2',
      'op://claude-slots/claude-setup-token-3/credential': 'kettle-slot-credential-3',
    },
    failures: { 'op://claude-slots/claude-setup-token-1/credential': '[ERROR] invented: the vault refused kettle-profile-credential' },
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
      'op://claude-slots/claude-setup-token-2/credential': 'kettle-slot-credential-2',
      'op://claude-slots/claude-setup-token-3/credential': 'kettle-slot-credential-3',
    },
    failures: { 'op://claude-slots/claude-setup-token-1/credential': '[ERROR] invented: kettle-slot-credential-1 is held back from kettle-profile-credential' },
  });
  const failures: Record<string, string> = {
    'Bearer kettle-slot-credential-2': 'invented proxy dropped kettle-slot-credential-2 minted by kettle-profile-credential',
    'Bearer kettle-slot-credential-3': 'invented proxy dropped kettle-slot-credential-3 minted by kettle-profile-credential',
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
  expect(JSON.parse(output).fleet.problems).toStrictEqual([
    'slot 1: op read failed (exit 1)',
    'slot 2: invented proxy dropped [redacted] minted by [redacted]',
    'slot 3: invented proxy dropped [redacted] minted by [redacted]',
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
      'op://claude-slots/claude-setup-token-2/credential': 'kettle-slot-credential-2',
      'op://claude-slots/claude-setup-token-3/credential': 'kettle-slot-credential-3',
    },
    failures: { 'op://claude-slots/claude-setup-token-1/credential': '[ERROR] invented: kettle-slot-credential-1 is held back from kettle-profile-credential' },
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
  };
  onTestFinished(overrideEnv('PATH', `${op.bin}:${process.env['PATH']}`));
  writeFileSync(settings, JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: 'kettle-profile-credential' } }));
  server.use(http.post(ANTHROPIC_MESSAGES_URL, (info) => answers[info.request.headers.get('authorization') ?? '']));
  console.log = () => {};

  await main(['capacity', '--refresh-slots']);

  const tables = z.array(z.object({ name: z.string() })).parse(fresh.db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all());
  const stored = tables.map((table) => ({ table: table.name, rows: JSON.stringify(fresh.db.query(`SELECT * FROM "${table.name}"`).all()) }));
  expect(fresh.db.query('SELECT slot, status, five_hour, five_hour_resets_at, seven_day, seven_day_resets_at FROM slot_usage ORDER BY slot').all()).toStrictEqual([
    { slot: 1, status: 'op-failed', five_hour: null, five_hour_resets_at: null, seven_day: null, seven_day_resets_at: null },
    { slot: 2, status: '429', five_hour: null, five_hour_resets_at: null, seven_day: 100, seven_day_resets_at: null },
    { slot: 3, status: '200', five_hour: null, five_hour_resets_at: null, seven_day: 40, seven_day_resets_at: '2026-10-21T00:00:00Z' },
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

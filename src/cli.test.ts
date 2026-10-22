import type { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import rulesTable from '../lanes.json';
import { NOON_SYDNEY, fakeAtc, freshDb } from '../test/helpers.ts';
import { main } from './cli.ts';
import { overrideEnv } from './config/override-env.ts';
import { setMeta } from './db/set-meta.ts';
import { loadActionsSpend } from './goals/load-actions-spend.ts';
import { addRun } from './runs/add-run.ts';

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

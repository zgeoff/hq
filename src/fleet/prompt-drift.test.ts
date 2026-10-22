import { expect, onTestFinished, test } from 'bun:test';
import { overrideEnv } from '../config/override-env.ts';
import { createDefsRepo, freshDb } from '../../test/helpers.ts';
import { readAfterExit } from '../../test/read-after-exit.ts';
import { resetFetchCache } from '../prompts/reset-fetch-cache.ts';
import { promptDrift } from './prompt-drift.ts';
import type { DriftClient, FleetEntry } from './types.ts';

const KETTLE = 'skills/kettle/references/session-prompt.md';

function setupTest() {
  resetFetchCache();
  const base = freshDb(),
    client: DriftClient = { prompt: () => Promise.resolve('You are Kettle.') },
    entry: FleetEntry = { name: 'z-kettle', cwd: base.dir, model: 'opus', prompt: `main:${KETTLE}`, wake: false };
  onTestFinished(base.cleanup);
  return { client, dir: base.dir, entry, createDefsRepo: (files: Record<string, string>) => createDefsRepo(base.dir, files) };
}

test('it reports a live session as current when hq-private holds its prompt', async () => {
  const ctx = setupTest();
  ctx.createDefsRepo({ [KETTLE]: '```text\nYou are Kettle.\n```\n' });
  {
    const result = await promptDrift(ctx.client, [ctx.entry], [{ id: 'id-kettle', name: 'z-kettle', alive: true }]);
    expect(result['z-kettle']?.state).toBe('current');
  }
});

test('it reports unknown, never stale, when hq-private is not a checkout', async () => {
  const ctx = setupTest();
  ctx.createDefsRepo({ [KETTLE]: '```text\nYou are Kettle.\n```\n' });
  onTestFinished(overrideEnv('HQ_PRIVATE_DIR', `${ctx.dir}/missing-private`));
  {
    const result = await promptDrift(ctx.client, [ctx.entry], [{ id: 'id-kettle', name: 'z-kettle', alive: true }]);
    expect(result['z-kettle']).toMatchObject({ state: 'unknown', since: null, hint: null });
    expect(result['z-kettle']?.reason).toContain("can't read the prompt hq would spawn with");
  }
});

test('it reads every session within the budget when the fetch of hq-private is slower than the budget', async () => {
  const ctx = setupTest(),
    entries = ['z-kettle', 'z-teapot', 'z-mug'].map((name): FleetEntry => ({ name, cwd: ctx.entry.cwd, model: ctx.entry.model, prompt: ctx.entry.prompt, wake: false })),
    repo = ctx.createDefsRepo({ [KETTLE]: '```text\nYou are Kettle.\n```\n' }),
    slow: DriftClient = { prompt: () => readAfterExit('You are Kettle.') };
  Bun.spawnSync(['git', '-C', repo.private, 'config', 'remote.origin.uploadpack', 'sleep 1; git-upload-pack']);
  {
    const result = await promptDrift(slow, entries, entries.map((e) => ({ id: `id-${e.name}`, name: e.name, alive: true })), {}, 500);
    expect(Object.values(result).map((drift) => drift.state)).toStrictEqual(['current', 'current', 'current']);
  }
});

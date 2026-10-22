import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFakeRunner } from '../../test/noslop-fake.ts';
import { HqError } from '../errors.ts';
import type { LinearCall } from '../linear/types.ts';
import { createIssueFile } from './create-issue-file.ts';
import { resetIssueFlags } from './reset-issue-flags.ts';

const HELP_WITH_FLAG = { code: 0, stdout: '  --issue-file <path>   The issue the change is for\n', stderr: '' };

function readFailingLinear(): ReturnType<LinearCall> {
  return Promise.reject(new HqError('linear_failed', 'Linear answered 500: lin_api_Badger123 rejected'));
}

function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-noslop-issue-'));
  onTestFinished(() => {
    rmSync(base, { recursive: true, force: true });
    resetIssueFlags();
  });
  return { base, path: join(base, 'issue.md') };
}

function buildLinear(issue: { identifier: string; title: string; description: string | null } | null): { call: LinearCall; asked: unknown[] } {
  const asked: unknown[] = [];
  return {
    asked,
    call: (_query, variables) => {
      asked.push(variables);
      return Promise.resolve({ issue });
    },
  };
}

test('it writes the issue file when the PR links an issue and noslop takes the flag', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopHelp: HELP_WITH_FLAG }),
    linear = buildLinear({ identifier: 'GEO-12', title: 'Mend the kettle', description: null }),
    made = await createIssueFile({ run: fake.run, linear: linear.call, clone: '/noslop', cwd: ctx.base, body: 'Fixes GEO-12', path: ctx.path });

  expect(made).toStrictEqual({ path: ctx.path, note: { issue: 'GEO-12', attached: true, why: 'attached' } });
  expect(readFileSync(ctx.path, 'utf8')).toBe('# GEO-12: Mend the kettle\n\n\n');
  expect(statSync(ctx.path).mode & 0o777).toBe(0o600);
});

test('it attaches nothing, and never asks Linear, when the pinned noslop lacks the flag', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    linear = buildLinear(null),
    made = await createIssueFile({ run: fake.run, linear: linear.call, clone: '/noslop', cwd: ctx.base, body: 'Fixes GEO-12', path: ctx.path });

  expect(made).toStrictEqual({ path: null, note: { issue: 'GEO-12', attached: false, why: 'the pinned noslop has no --issue-file' } });
  expect(linear.asked).toStrictEqual([]);
  expect(existsSync(ctx.path)).toBe(false);
});

test('it asks noslop for its help once per clone', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopHelp: HELP_WITH_FLAG }),
    linear = buildLinear({ identifier: 'GEO-12', title: 'Kettle', description: 'Boil.' });

  await createIssueFile({ run: fake.run, linear: linear.call, clone: '/noslop', cwd: ctx.base, body: 'Fixes GEO-12', path: ctx.path });
  await createIssueFile({ run: fake.run, linear: linear.call, clone: '/noslop', cwd: ctx.base, body: 'Fixes GEO-12', path: ctx.path });

  expect(fake.of('bun').map((c) => c.cmd.slice(-2))).toStrictEqual([['review', '--help']]);
});

test('it attaches nothing, and never throws, when Linear fails or has no such issue', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopHelp: HELP_WITH_FLAG });

  await expect(createIssueFile({ run: fake.run, linear: readFailingLinear, clone: '/noslop', cwd: ctx.base, body: 'Fixes GEO-12', path: ctx.path })).resolves.toStrictEqual({ path: null, note: { issue: 'GEO-12', attached: false, why: 'could not read it from Linear: Linear answered 500: [key] rejected' } });
  await expect(createIssueFile({ run: fake.run, linear: buildLinear(null).call, clone: '/noslop', cwd: ctx.base, body: 'Fixes GEO-99', path: ctx.path })).resolves.toStrictEqual({ path: null, note: { issue: 'GEO-99', attached: false, why: 'could not read it from Linear: Linear has no issue GEO-99' } });
  expect(existsSync(ctx.path)).toBe(false);
});

test('it attaches nothing, and never throws, when the noslop help cannot run', async () => {
  const ctx = setupTest(),
    made = await createIssueFile({ run: () => Promise.reject(new Error('spawn bun ENOENT')), linear: buildLinear(null).call, clone: '/noslop', cwd: ctx.base, body: 'Fixes GEO-12', path: ctx.path });

  expect(made).toStrictEqual({ path: null, note: { issue: 'GEO-12', attached: false, why: 'could not ask noslop for its flags: spawn bun ENOENT' } });
});

test('it attaches nothing, and never throws, when it can neither write nor remove the issue file', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopHelp: HELP_WITH_FLAG }),
    folder = join(ctx.base, 'folder');
  mkdirSync(folder);

  await expect(createIssueFile({ run: fake.run, linear: buildLinear({ identifier: 'GEO-12', title: 'Kettle', description: 'Boil.' }).call, clone: '/noslop', cwd: ctx.base, body: 'Fixes GEO-12', path: folder })).resolves.toMatchObject({
    path: null,
    note: { issue: 'GEO-12', attached: false },
  });
});

test('it attaches nothing when the PR body links no GEO issue', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopHelp: HELP_WITH_FLAG }),
    made = await createIssueFile({ run: fake.run, linear: buildLinear(null).call, clone: '/noslop', cwd: ctx.base, body: 'Tidy the lid.', path: ctx.path });

  expect(made.note).toStrictEqual({ issue: null, attached: false, why: 'the PR body links no GEO issue' });
  expect(fake.of('bun')).toStrictEqual([]);
});

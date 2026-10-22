import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { chmodSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { at, fakeAtc, freshDb } from '../../test/helpers.ts';
import { main } from '../cli.ts';
import { overrideEnv } from '../config/override-env.ts';
import { readReferenceCounts } from './read-reference-counts.ts';
import { readUnopenedReferences } from './read-unopened-references.ts';

// A temp definitions tree for linear-triage references (fleet.json gives that skill to the triage
// role), and a temp projects dir of invented transcripts written relative to HQ_NOW.
function setupTest() {
  const fresh = freshDb();
  const now = '2026-10-17T00:00:00Z';
  const definitions = join(fresh.dir, 'defs');
  const projects = join(fresh.dir, 'projects');
  at(now);
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOW', now));
  onTestFinished(overrideEnv('HQ_DEFINITIONS_DIR', definitions));
  onTestFinished(overrideEnv('HQ_CLAUDE_PROJECTS', projects));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  return {
    triage: '11111111-2222-4333-8444-555555555555',
    stranger: '99999999-2222-4333-8444-555555555555',
    directory: fresh.dir,
    references: (names: string[]) => {
      mkdirSync(join(definitions, 'skills/linear-triage/references'), { recursive: true });
      for (const name of names) {
        writeFileSync(join(definitions, 'skills/linear-triage/references', name), `# ${name}\n`);
      }
    },
    read: (session: string, path: string, timestamp = '2026-10-16T01:00:00.000Z', extra: object = {}) =>
      JSON.stringify({ type: 'assistant', sessionId: session, timestamp, message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_read', name: 'Read', input: { file_path: path } }] }, ...extra }),
    bash: (session: string, command: string) =>
      JSON.stringify({ type: 'assistant', sessionId: session, timestamp: '2026-10-16T02:00:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_bash', name: 'Bash', input: { command } }] } }),
    transcript: (relative: string, lines: string[], ageDays: number) => {
      const path = join(projects, relative);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, `${lines.join('\n')}\n`);
      const time = new Date(Date.parse(now) - ageDays * 86_400_000);
      utimesSync(path, time, time);
    },
    startAtc: (sessions: { id: string; name: string; alive: boolean; state: string; agentSessionID: string }[]) => {
      const atc = fakeAtc(fresh.dir, sessions);
      onTestFinished(atc.stop);
      onTestFinished(overrideEnv('HQ_ATC_SOCKET', atc.path));
    },
  };
}

test('hq refs --days 7 counts distinct sessions per reference, zeros first, inside the window only', async () => {
  const ctx = setupTest();
  ctx.references(['kettle.md', 'widgets.md', 'teapot.md', 'spout.md']);
  const defs = '/work/defs/skills/linear-triage/references';
  ctx.transcript(
    '-work-defs/fresh.jsonl',
    [
      ctx.read(ctx.triage, `${defs}/widgets.md`),
      ctx.read(ctx.triage, `${defs}/widgets.md`),
      ctx.bash(ctx.triage, `cat ${defs}/kettle.md | head -40`),
      ctx.read(ctx.triage, `${defs}/teapot.md`, '2026-10-09T00:00:00.000Z'),
      ctx.read(ctx.stranger, `${defs}/spout.md`),
    ],
    1,
  );
  ctx.transcript('-work-defs/old.jsonl', [ctx.read(ctx.triage, `${defs}/spout.md`, '2026-10-16T00:00:00.000Z')], 8);
  ctx.startAtc([{ id: 'id-triage', name: 'z-triage', alive: true, state: 'done', agentSessionID: ctx.triage }]);
  const log = spyOn(console, 'log').mockImplementation(() => {});
  onTestFinished(() => log.mockRestore());

  await main(['refs', '--days', '7']);

  expect(log.mock.calls).toStrictEqual([
    [
      [
        'triage: sessions that opened each reference in the last 7 day(s)',
        '   0  linear-triage/references/spout.md',
        '   0  linear-triage/references/teapot.md',
        '   1  linear-triage/references/kettle.md',
        '   1  linear-triage/references/widgets.md',
      ].join('\n'),
    ],
  ]);
});

test('hq refs --json gives every pair with its count', async () => {
  const ctx = setupTest();
  ctx.references(['kettle.md', 'widgets.md', 'teapot.md', 'spout.md']);
  ctx.transcript('-work-defs/s.jsonl', [ctx.bash(ctx.triage, 'sed -n 1,20p ~/defs/skills/linear-triage/references/teapot.md')], 1);
  ctx.startAtc([{ id: 'id-triage', name: 'z-triage', alive: true, state: 'done', agentSessionID: ctx.triage }]);
  const log = spyOn(console, 'log').mockImplementation(() => {});
  onTestFinished(() => log.mockRestore());

  await main(['refs', '--json']);

  expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toStrictEqual({
    ok: true,
    days: 7,
    items: [
      { role: 'triage', reference: 'linear-triage/references/kettle.md', count: 0 },
      { role: 'triage', reference: 'linear-triage/references/spout.md', count: 0 },
      { role: 'triage', reference: 'linear-triage/references/teapot.md', count: 1 },
      { role: 'triage', reference: 'linear-triage/references/widgets.md', count: 0 },
    ],
  });
});

test('two sessions of one role that open the same reference count as 2', async () => {
  const ctx = setupTest();
  ctx.references(['kettle.md', 'widgets.md', 'teapot.md', 'spout.md']);
  const second = '22222222-2222-4333-8444-555555555555';
  ctx.transcript('-work-defs/a.jsonl', [ctx.read(ctx.triage, '/d/skills/linear-triage/references/kettle.md')], 1);
  ctx.transcript('-work-defs/b.jsonl', [ctx.read(second, '/d/skills/linear-triage/references/kettle.md')], 2);
  const sessions = () => Promise.resolve([
    { id: 'id-a', name: 'z-triage', alive: false, state: 'exited', agentSessionID: ctx.triage },
    { id: 'id-b', name: 'z-refine', alive: true, state: 'done', agentSessionID: second },
  ]);

  const counts = await readReferenceCounts({ days: 7, sessions });

  expect(counts.find((item) => item.reference === 'linear-triage/references/kettle.md')).toStrictEqual({ role: 'triage', reference: 'linear-triage/references/kettle.md', count: 2 });
});

test('the unopened list holds the zero pairs for the goals line', async () => {
  const ctx = setupTest();
  ctx.references(['kettle.md', 'widgets.md', 'teapot.md', 'spout.md']);
  ctx.transcript('-work-defs/s.jsonl', [ctx.read(ctx.triage, '/d/skills/linear-triage/references/kettle.md'), ctx.read(ctx.triage, '/d/skills/linear-triage/references/spout.md')], 1);
  const sessions = () => Promise.resolve([{ id: 'id-triage', name: 'z-triage', alive: true, state: 'done', agentSessionID: ctx.triage }]);

  await expect(readUnopenedReferences({ days: 7, sessions })).resolves.toStrictEqual([
    { role: 'triage', reference: 'linear-triage/references/teapot.md' },
    { role: 'triage', reference: 'linear-triage/references/widgets.md' },
  ]);
});

test('a read after long lines, across stream chunks, still counts', async () => {
  const ctx = setupTest();
  ctx.references(['kettle.md', 'widgets.md', 'teapot.md', 'spout.md']);
  const padding = JSON.stringify({ type: 'user', sessionId: ctx.triage, message: { content: 'widgets '.repeat(200_000) } });
  ctx.transcript('-work-defs/s.jsonl', [padding, ctx.read(ctx.triage, '/d/skills/linear-triage/references/kettle.md'), padding, ctx.read(ctx.triage, '/d/skills/linear-triage/references/teapot.md', '2026-10-16T03:00:00.000Z', { note: 'kettle '.repeat(100_000) })], 1);
  const sessions = () => Promise.resolve([{ id: 'id-triage', name: 'z-triage', alive: true, state: 'done', agentSessionID: ctx.triage }]);

  await expect(readUnopenedReferences({ days: 7, sessions })).resolves.toStrictEqual([
    { role: 'triage', reference: 'linear-triage/references/spout.md' },
    { role: 'triage', reference: 'linear-triage/references/widgets.md' },
  ]);
});

test('hq refs fails with atc_unreachable instead of reporting zeros when atc does not answer', async () => {
  const ctx = setupTest();
  ctx.references(['kettle.md']);
  ctx.transcript('-work-defs/s.jsonl', [ctx.read(ctx.triage, '/d/skills/linear-triage/references/kettle.md')], 1);
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', join(ctx.directory, 'no-kettle-here.sock')));
  const log = spyOn(console, 'log').mockImplementation(() => {});
  onTestFinished(() => log.mockRestore());

  await main(['refs', '--json']);

  expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toStrictEqual({
    ok: false,
    error: { code: 'atc_unreachable', message: "hq refs needs atc's session list to give each transcript its role: Error: Failed to connect" },
  });
});

test('a session list that fails fails the unopened list instead of listing every reference', async () => {
  const ctx = setupTest();
  ctx.references(['kettle.md', 'widgets.md']);

  await expect(readUnopenedReferences({ days: 7, sessions: () => Promise.reject(new Error('atc kettle is cold')) })).rejects.toThrow("hq refs needs atc's session list to give each transcript its role: Error: atc kettle is cold");
});

test.skipIf(process.getuid?.() === 0)('a transcript hq cannot read fails the counts instead of leaving its opens uncounted', async () => {
  const ctx = setupTest();
  ctx.references(['kettle.md']);
  ctx.transcript('-work-defs/locked.jsonl', [ctx.read(ctx.triage, '/d/skills/linear-triage/references/kettle.md')], 1);
  chmodSync(join(ctx.directory, 'projects/-work-defs/locked.jsonl'), 0o000);
  const sessions = () => Promise.resolve([{ id: 'id-triage', name: 'z-triage', alive: true, state: 'done', agentSessionID: ctx.triage }]);

  await expect(readReferenceCounts({ days: 7, sessions })).rejects.toMatchObject({ code: 'EACCES' });
});

test('hq refs --days 14 counts an open from eight days ago', async () => {
  const ctx = setupTest();
  ctx.references(['kettle.md', 'widgets.md']);
  ctx.transcript('-work-defs/old.jsonl', [ctx.read(ctx.triage, '/d/skills/linear-triage/references/kettle.md', '2026-10-09T00:00:00.000Z')], 8);
  ctx.startAtc([{ id: 'id-triage', name: 'z-triage', alive: true, state: 'done', agentSessionID: ctx.triage }]);
  const log = spyOn(console, 'log').mockImplementation(() => {});
  onTestFinished(() => log.mockRestore());

  await main(['refs', '--days', '14', '--json']);

  expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toStrictEqual({
    ok: true,
    days: 14,
    items: [
      { role: 'triage', reference: 'linear-triage/references/kettle.md', count: 1 },
      { role: 'triage', reference: 'linear-triage/references/widgets.md', count: 0 },
    ],
  });
});

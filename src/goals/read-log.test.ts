import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildNodeStateFiles } from '../state/build-node-state-files.ts';
import { runStateTrim } from '../state/run-state-trim.ts';
import { buildNodeLogFiles } from './build-node-log-files.ts';
import { readLog } from './read-log.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-read-log-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return { directory };
}

test('it counts an entry that hq state trim moved into a monthly archive', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'delivery.md'), '## Log\n- 2026-10-20T09:00Z HOLD kettle until the lid is fixed\n');
  writeFileSync(
    join(ctx.directory, 'delivery-archive-2026-10.md'),
    '<!-- moved from delivery.md by hq state trim at 2026-10-31T01:02:03Z -->\n- 2026-10-13T22:30Z DEPLOY kettle 0.1.0 live\n',
  );

  expect(readLog(ctx.directory, buildNodeLogFiles())).toStrictEqual({
    events: [
      { kind: 'DEPLOY', at: '2026-10-13T22:30:00Z' },
      { kind: 'HOLD', at: '2026-10-20T09:00:00Z' },
    ],
    from: '2026-10-13T22:30:00Z',
  });
});

test('it still counts every entry after hq state trim moved the oldest out of delivery.md', () => {
  const ctx = setupTest();
  writeFileSync(
    join(ctx.directory, 'delivery.md'),
    `## Log\n${Array.from({ length: 40 }, (_unused, index) => `- 2026-10-13T09:${String(index).padStart(2, '0')}Z DEPLOY kettle ${'x'.repeat(500)}\n`).join('')}`,
  );
  runStateTrim({
    directory: ctx.directory,
    roles: ['delivery'],
    role: 'delivery',
    actor: 'z-delivery',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(readLog(ctx.directory, buildNodeLogFiles()).events).toHaveLength(40);
});

test('it dates every time-only entry by its day heading after hq state trim cut the day in two', () => {
  const ctx = setupTest();
  writeFileSync(
    join(ctx.directory, 'delivery.md'),
    `## Log\n### 2026-10-13\n${Array.from({ length: 40 }, (_unused, index) => {
      const minutes = 22 * 60 + index * 10;
      return `- ${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}Z DEPLOY kettle ${'x'.repeat(500)}\n`;
    }).join('')}`,
  );
  runStateTrim({
    directory: ctx.directory,
    roles: ['delivery'],
    role: 'delivery',
    actor: 'z-delivery',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(readLog(ctx.directory, buildNodeLogFiles())).toStrictEqual({
    events: Array.from({ length: 40 }, (_unused, index) => ({ kind: 'DEPLOY', at: new Date(Date.parse('2026-10-13T22:00:00Z') + index * 600_000).toISOString().replace('.000Z', 'Z') })),
    from: '2026-10-13T22:00:00Z',
  });
});

test('it never gives a later trimmed batch with no day the day of the batch before it', () => {
  const ctx = setupTest();
  writeFileSync(
    join(ctx.directory, 'delivery.md'),
    `## Log\n${Array.from({ length: 40 }, (_unused, index) => `- 2026-10-13T09:${String(index).padStart(2, '0')}Z DEPLOY kettle ${'x'.repeat(500)}\n`).join('')}`,
  );
  runStateTrim({
    directory: ctx.directory,
    roles: ['delivery'],
    role: 'delivery',
    actor: 'z-delivery',
    dryRun: false,
    at: new Date('2026-10-20T01:02:03Z'),
    files: buildNodeStateFiles(),
  });
  writeFileSync(join(ctx.directory, 'delivery.md'), `## Log\n${Array.from({ length: 40 }, (_unused, index) => `- 10:${String(index).padStart(2, '0')}Z HOLD kettle ${'x'.repeat(500)}\n`).join('')}`);
  runStateTrim({
    directory: ctx.directory,
    roles: ['delivery'],
    role: 'delivery',
    actor: 'z-delivery',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(readLog(ctx.directory, buildNodeLogFiles())).toStrictEqual({
    events: Array.from({ length: 19 }, (_unused, index) => ({ kind: 'DEPLOY', at: `2026-10-13T09:${String(index).padStart(2, '0')}:00Z` })),
    from: '2026-10-13T09:00:00Z',
  });
});

test('it still counts the old archive beside the monthly ones', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'delivery-archive.md'), '- 2026-09-01T08:00Z DEPLOY kettle 0.0.9 live\n');
  writeFileSync(join(ctx.directory, 'delivery-archive-2026-10.md'), '- 2026-10-13T22:30Z DEPLOY kettle 0.1.0 live\n');

  expect(readLog(ctx.directory, buildNodeLogFiles())).toStrictEqual({
    events: [
      { kind: 'DEPLOY', at: '2026-09-01T08:00:00Z' },
      { kind: 'DEPLOY', at: '2026-10-13T22:30:00Z' },
    ],
    from: '2026-09-01T08:00:00Z',
  });
});

test('it reads only the monthly archives the folder listing names', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'delivery-archive-2026-09.md'), '- 2026-09-13T22:30Z DEPLOY kettle 0.0.9 live\n');
  writeFileSync(join(ctx.directory, 'delivery-archive-2026-10.md'), '- 2026-10-13T22:30Z DEPLOY kettle 0.1.0 live\n');

  expect(readLog(ctx.directory, { ...buildNodeLogFiles(), listNames: () => ['delivery-archive-2026-10.md'] })).toStrictEqual({
    events: [{ kind: 'DEPLOY', at: '2026-10-13T22:30:00Z' }],
    from: '2026-10-13T22:30:00Z',
  });
});

test('it ignores an archive of another role', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle-archive-2026-10.md'), '- 2026-10-13T22:30Z DEPLOY kettle 0.1.0 live\n');

  expect(readLog(ctx.directory, buildNodeLogFiles())).toStrictEqual({ events: [], from: null });
});

test('it reads a missing state folder as no events', () => {
  const ctx = setupTest();

  expect(readLog(join(ctx.directory, 'absent'), buildNodeLogFiles())).toStrictEqual({ events: [], from: null });
});

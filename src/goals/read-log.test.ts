import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  expect(readLog(ctx.directory)).toStrictEqual({
    events: [
      { kind: 'DEPLOY', at: '2026-10-13T22:30:00Z' },
      { kind: 'HOLD', at: '2026-10-20T09:00:00Z' },
    ],
    from: '2026-10-13T22:30:00Z',
  });
});

test('it still counts the old archive beside the monthly ones', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'delivery-archive.md'), '- 2026-09-01T08:00Z DEPLOY kettle 0.0.9 live\n');
  writeFileSync(join(ctx.directory, 'delivery-archive-2026-10.md'), '- 2026-10-13T22:30Z DEPLOY kettle 0.1.0 live\n');

  expect(readLog(ctx.directory)).toStrictEqual({
    events: [
      { kind: 'DEPLOY', at: '2026-09-01T08:00:00Z' },
      { kind: 'DEPLOY', at: '2026-10-13T22:30:00Z' },
    ],
    from: '2026-09-01T08:00:00Z',
  });
});

test('it ignores an archive of another role', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle-archive-2026-10.md'), '- 2026-10-13T22:30Z DEPLOY kettle 0.1.0 live\n');

  expect(readLog(ctx.directory)).toStrictEqual({ events: [], from: null });
});

test('it reads a missing state folder as no events', () => {
  const ctx = setupTest();

  expect(readLog(join(ctx.directory, 'absent'))).toStrictEqual({ events: [], from: null });
});

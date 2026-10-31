import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildNodeStateFiles } from './build-node-state-files.ts';
import { runStateCommand } from './run-state-command.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-state-command-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return { directory };
}

test('#runStateCommand trim reports in text and in data', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle.md'), `## Log\n${'09:10Z boiled the water\n'.repeat(1000)}09:11Z poured the tea\n`);

  const out = runStateCommand({
    verb: 'trim',
    rest: ['kettle'],
    dryRun: false,
    directory: ctx.directory,
    roles: ['kettle'],
    at: new Date('2026-10-31T01:02:03Z'),
    actor: 'z-kettle',
    files: buildNodeStateFiles(),
  });

  expect(out.data).toMatchObject({
    role: 'kettle',
    written: true,
    archive: join(ctx.directory, 'kettle-archive-2026-10.md'),
  });
});

test('#runStateCommand the text names the sizes, the archive and the backup', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle.md'), `## Log\n${'09:10Z boiled the water\n'.repeat(1000)}09:11Z poured the tea\n`);

  const out = runStateCommand({
    verb: 'trim',
    rest: ['kettle'],
    dryRun: false,
    directory: ctx.directory,
    roles: ['kettle'],
    at: new Date('2026-10-31T01:02:03Z'),
    actor: 'z-kettle',
    files: buildNodeStateFiles(),
  });

  expect(out.text).toContain(`archive: ${join(ctx.directory, 'kettle-archive-2026-10.md')}\nbackup: ${join(ctx.directory, 'kettle.md.bak-20261031T010203Z')}`);
});

test('#runStateCommand a dry run says so', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle.md'), `## Log\n${'09:10Z boiled the water\n'.repeat(1000)}09:11Z poured the tea\n`);

  const out = runStateCommand({
    verb: 'trim',
    rest: ['kettle'],
    dryRun: true,
    directory: ctx.directory,
    roles: ['kettle'],
    at: new Date('2026-10-31T01:02:03Z'),
    actor: 'z-kettle',
    files: buildNodeStateFiles(),
  });

  expect(out.text).toEndWith('dry run: nothing written');
});

test('it says plainly how far over the limit the file stays after the log', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle.md'), `${'cursor line\n'.repeat(2000)}## Log\n09:10Z boiled the water\n09:11Z poured the tea\n`);

  const out = runStateCommand({
    verb: 'trim',
    rest: ['kettle'],
    dryRun: false,
    directory: ctx.directory,
    roles: ['kettle'],
    at: new Date('2026-10-31T01:02:03Z'),
    actor: 'z-kettle',
    files: buildNodeStateFiles(),
  });

  expect(out.text).toMatch(/still \d+\.\d KB over the limit after the log; trim the other sections by hand/u);
});

test('#runStateCommand an unknown verb is refused', () => {
  const ctx = setupTest();

  expect(() =>
    runStateCommand({
      verb: 'shrink',
      rest: ['kettle'],
      dryRun: false,
      directory: ctx.directory,
      roles: ['kettle'],
      at: new Date('2026-10-31T01:02:03Z'),
      actor: 'z-kettle',
      files: buildNodeStateFiles(),
    }),
  ).toThrow('unknown command: hq state shrink');
});

test('#runStateCommand a missing role is refused', () => {
  const ctx = setupTest();

  expect(() =>
    runStateCommand({
      verb: 'trim',
      rest: [],
      dryRun: false,
      directory: ctx.directory,
      roles: ['kettle'],
      at: new Date('2026-10-31T01:02:03Z'),
      actor: 'z-kettle',
      files: buildNodeStateFiles(),
    }),
  ).toThrow('give the role');
});

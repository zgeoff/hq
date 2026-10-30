import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runStateCommand } from './run-state-command.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-state-command-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'kettle.md');
  writeFileSync(file, `## Log\n${'09:10Z boiled the water\n'.repeat(1000)}09:11Z poured the tea\n`);
  const args = { verb: 'trim', rest: ['kettle'], dryRun: false, directory, roles: ['kettle'], at: new Date('2026-10-31T01:02:03Z'), readText: (path: string) => readFileSync(path, 'utf8') };
  return { directory, file, args };
}

test('#runStateCommand trim reports in text and in data', () => {
  const ctx = setupTest();

  const out = runStateCommand(ctx.args);

  expect(out.data).toMatchObject({ role: 'kettle', written: true, archive: join(ctx.directory, 'kettle-archive-2026-10.md') });
});

test('#runStateCommand the text names the sizes, the archive and the backup', () => {
  const ctx = setupTest();

  const out = runStateCommand(ctx.args);

  expect(out.text).toContain(`archive: ${join(ctx.directory, 'kettle-archive-2026-10.md')}\nbackup: ${join(ctx.directory, 'kettle.md.bak-20261031T010203Z')}`);
});

test('#runStateCommand a dry run says so', () => {
  const ctx = setupTest();

  expect(runStateCommand({ ...ctx.args, dryRun: true }).text).toEndWith('dry run: nothing written');
});

test('it says plainly how far over the limit the file stays after the log', () => {
  const ctx = setupTest();
  writeFileSync(ctx.file, `${'cursor line\n'.repeat(2000)}## Log\n09:10Z boiled the water\n09:11Z poured the tea\n`);

  expect(runStateCommand(ctx.args).text).toMatch(/still \d+\.\d KB over the limit after the log; trim the other sections by hand/u);
});

test('#runStateCommand an unknown verb is refused', () => {
  const ctx = setupTest();

  expect(() => runStateCommand({ ...ctx.args, verb: 'shrink' })).toThrow('unknown command: hq state shrink');
});

test('#runStateCommand a missing role is refused', () => {
  const ctx = setupTest();

  expect(() => runStateCommand({ ...ctx.args, rest: [] })).toThrow('give the role');
});

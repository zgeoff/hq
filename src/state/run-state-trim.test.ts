import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runStateTrim } from './run-state-trim.ts';

// A state folder holding kettle.md: 40 log lines of invented text between a cursor and a hold.
function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-state-trim-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  const file = join(directory, 'kettle.md');
  writeFileSync(file, original);
  const at = new Date('2026-10-31T01:02:03Z');
  const args = { directory, roles: ['kettle', 'delivery'], role: 'kettle', dryRun: false, at, readText: (path: string) => readFileSync(path, 'utf8') };
  const backup = join(directory, 'kettle.md.bak-20261031T010203Z');
  const archive = join(directory, 'kettle-archive-2026-10.md');

  // a reader that lets another writer change the state file between the trim's read and its replace
  let reads = 0;
  const readTextWhileChanged = (path: string) => {
    reads++;
    if (reads === 2) {
      writeFileSync(file, `${original}09:99Z another session wrote this\n`);
    }
    return readFileSync(path, 'utf8');
  };
  return { directory, head, entries, tail, original, file, args, backup, archive, readTextWhileChanged };
}

test('it moves the oldest entries until the file is under its limit', () => {
  const ctx = setupTest();

  runStateTrim(ctx.args);

  expect(Buffer.byteLength(readFileSync(ctx.file, 'utf8'))).toBeLessThanOrEqual(16_384);
});

test('it keeps the header and the other sections byte for byte', () => {
  const ctx = setupTest();

  runStateTrim(ctx.args);

  const text = readFileSync(ctx.file, 'utf8');
  expect([text.startsWith(`${ctx.head}## Log\n`), text.endsWith(ctx.tail)]).toStrictEqual([true, true]);
});

test('it keeps the newest entries and moves only a leading run of the oldest', () => {
  const ctx = setupTest();

  const report = runStateTrim(ctx.args);

  expect(readFileSync(ctx.file, 'utf8')).toBe(`${ctx.head}## Log\n${ctx.entries.slice(report.entriesMoved).join('')}${ctx.tail}`);
});

test('it appends the moved entries to the monthly archive after a marker line', () => {
  const ctx = setupTest();

  const report = runStateTrim(ctx.args);

  expect(readFileSync(ctx.archive, 'utf8')).toBe(`<!-- moved from kettle.md by hq state trim at 2026-10-31T01:02:03Z -->\n${ctx.entries.slice(0, report.entriesMoved).join('')}`);
});

test('it adds a second batch to an archive that exists', () => {
  const ctx = setupTest();
  writeFileSync(ctx.archive, 'an older batch without a newline');

  runStateTrim(ctx.args);

  expect(readFileSync(ctx.archive, 'utf8')).toStartWith('an older batch without a newline\n<!-- moved from kettle.md');
});

test('it copies the state file to a timestamped backup before it changes it', () => {
  const ctx = setupTest();

  runStateTrim(ctx.args);

  expect(readFileSync(ctx.backup, 'utf8')).toBe(ctx.original);
});

test('it reports the sizes, the entries moved, the archive and the backup', () => {
  const ctx = setupTest();

  const report = runStateTrim(ctx.args);

  expect(report).toStrictEqual({
    role: 'kettle',
    file: ctx.file,
    dryRun: false,
    written: true,
    limitBytes: 16_384,
    beforeBytes: Buffer.byteLength(ctx.original),
    afterBytes: Buffer.byteLength(readFileSync(ctx.file, 'utf8')),
    entriesMoved: report.entriesMoved,
    archive: ctx.archive,
    backup: ctx.backup,
  });
});

test('it never touches the older delivery and release archives', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'delivery-archive.md'), 'old delivery notes\n');

  runStateTrim(ctx.args);

  expect(readFileSync(join(ctx.directory, 'delivery-archive.md'), 'utf8')).toBe('old delivery notes\n');
});

test('#runStateTrim a dry run reports the same plan and writes nothing', () => {
  const ctx = setupTest();

  const report = runStateTrim({ ...ctx.args, dryRun: true });

  expect(report).toMatchObject({ dryRun: true, written: false, entriesMoved: expect.any(Number) });
});

test('#runStateTrim a dry run leaves the folder as it was', () => {
  const ctx = setupTest();

  runStateTrim({ ...ctx.args, dryRun: true });

  expect(readdirSync(ctx.directory)).toStrictEqual(['kettle.md']);
});

test('#runStateTrim a file already under its limit is left alone, with no backup', () => {
  const ctx = setupTest();
  writeFileSync(ctx.file, '## Log\n09:10Z boiled the water\n09:11Z poured the tea\n');

  runStateTrim(ctx.args);

  expect(readdirSync(ctx.directory)).toStrictEqual(['kettle.md']);
});

test('it keeps the newest entry when the other sections alone leave the file over the limit', () => {
  const ctx = setupTest();
  writeFileSync(ctx.file, `${'cursor line\n'.repeat(2000)}## Log\n09:10Z boiled the water\n09:11Z poured the tea\n`);

  runStateTrim(ctx.args);

  expect(readFileSync(ctx.file, 'utf8')).toEndWith('## Log\n09:11Z poured the tea\n');
});

test('it reports how far over the limit the file stays', () => {
  const ctx = setupTest();
  writeFileSync(ctx.file, `${'cursor line\n'.repeat(2000)}## Log\n09:10Z boiled the water\n09:11Z poured the tea\n`);

  const report = runStateTrim(ctx.args);

  expect(report.afterBytes).toBeGreaterThan(report.limitBytes);
});

test('#runStateTrim delivery trims to 15 KB', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'delivery.md'), `## Log\n${ctx.entries.join('')}`);

  const report = runStateTrim({ ...ctx.args, role: 'delivery' });

  expect(report.limitBytes).toBe(15_360);
});

test('#runStateTrim a file with no log section is refused in a real run', () => {
  const ctx = setupTest();
  writeFileSync(ctx.file, '# kettle\n\n## Cursors\nspout: 4\n');

  expect(() => runStateTrim(ctx.args)).toThrow('kettle.md has no "## Log" section, so hq state trim cannot trim it; trim it by hand');
});

test('#runStateTrim a file with no log section is refused in a dry run', () => {
  const ctx = setupTest();
  writeFileSync(ctx.file, '# kettle\n\n## Cursors\nspout: 4\n');

  expect(() => runStateTrim({ ...ctx.args, dryRun: true })).toThrow('kettle.md has no "## Log" section, so hq state trim cannot trim it; trim it by hand');
});

test('#runStateTrim a refused file gets no backup', () => {
  const ctx = setupTest();
  writeFileSync(ctx.file, '# kettle\n');

  expect(() => runStateTrim(ctx.args)).toThrow();
  expect(existsSync(ctx.backup)).toBe(false);
});

test('#runStateTrim a role outside the fleet is refused', () => {
  const ctx = setupTest();

  expect(() => runStateTrim({ ...ctx.args, role: 'teapot' })).toThrow('teapot is not a fleet role');
});

test('#runStateTrim a role with no state file is refused', () => {
  const ctx = setupTest();

  expect(() => runStateTrim({ ...ctx.args, role: 'delivery' })).toThrow('delivery.md does not exist');
});

test('#runStateTrim a state file changed between the read and the replace is not replaced', () => {
  const ctx = setupTest();

  expect(() => runStateTrim({ ...ctx.args, readText: ctx.readTextWhileChanged })).toThrow('changed while hq state trim ran, so it was not replaced');
  expect(readFileSync(ctx.file, 'utf8')).toBe(`${ctx.original}09:99Z another session wrote this\n`);
});

test('#runStateTrim an aborted replace leaves the backup and the archive append in place', () => {
  const ctx = setupTest();

  expect(() => runStateTrim({ ...ctx.args, readText: ctx.readTextWhileChanged })).toThrow('Rerun hq state trim kettle');
  expect([readFileSync(ctx.backup, 'utf8'), readFileSync(ctx.archive, 'utf8')]).toStrictEqual([ctx.original, expect.stringContaining('<!-- moved from kettle.md')]);
});

import { expect, onTestFinished, test } from 'bun:test';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readChangingFile } from '../../test/read-changing-file.ts';
import { buildNodeStateFiles } from './build-node-state-files.ts';
import { runStateTrim } from './run-state-trim.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-state-trim-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return { directory };
}

test('it moves the oldest entries until the file is under its limit', () => {
  const ctx = setupTest();
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);

  runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  const text = readFileSync(join(ctx.directory, 'kettle.md'), 'utf8');
  expect(Buffer.byteLength(text)).toBe(16_349);
});

test('it keeps the header and the other sections byte for byte', () => {
  const ctx = setupTest();
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);

  runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  const text = readFileSync(join(ctx.directory, 'kettle.md'), 'utf8');
  expect(text).toStartWith(`${head}## Log\n`);
  expect(text).toEndWith(tail);
});

test('it keeps the newest entries and moves only a leading run of the oldest', () => {
  const ctx = setupTest();
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);

  runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(readFileSync(join(ctx.directory, 'kettle.md'), 'utf8')).toBe(`${head}## Log\n${entries.slice(10).join('')}${tail}`);
});

test('it appends the moved entries to the monthly archive after a marker line', () => {
  const ctx = setupTest();
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);

  runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(readFileSync(join(ctx.directory, 'kettle-archive-2026-10.md'), 'utf8')).toBe(`<!-- moved from kettle.md by hq state trim at 2026-10-31T01:02:03Z -->\n${entries.slice(0, 10).join('')}`);
});

test('it adds a second batch to an archive that exists', () => {
  const ctx = setupTest();
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);
  writeFileSync(join(ctx.directory, 'kettle-archive-2026-10.md'), 'an older batch without a newline');

  runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(readFileSync(join(ctx.directory, 'kettle-archive-2026-10.md'), 'utf8')).toStartWith('an older batch without a newline\n<!-- moved from kettle.md');
});

test('it copies the state file to a timestamped backup before it changes it', () => {
  const ctx = setupTest();
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);

  runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(readFileSync(join(ctx.directory, 'kettle.md.bak-20261031T010203Z'), 'utf8')).toBe(original);
});

test('it reports the sizes, the entries moved, the archive and the backup', () => {
  const ctx = setupTest();
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);

  const report = runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(report).toStrictEqual({
    role: 'kettle',
    file: join(ctx.directory, 'kettle.md'),
    dryRun: false,
    written: true,
    limitBytes: 16_384,
    beforeBytes: Buffer.byteLength(original),
    afterBytes: 16_349,
    entriesMoved: 10,
    archive: join(ctx.directory, 'kettle-archive-2026-10.md'),
    backup: join(ctx.directory, 'kettle.md.bak-20261031T010203Z'),
  });
});

test('it never touches the older delivery and release archives', () => {
  const ctx = setupTest();
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);
  writeFileSync(join(ctx.directory, 'delivery-archive.md'), 'old delivery notes\n');
  writeFileSync(join(ctx.directory, 'release-archive.md'), 'old release notes\n');

  runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect([readFileSync(join(ctx.directory, 'delivery-archive.md'), 'utf8'), readFileSync(join(ctx.directory, 'release-archive.md'), 'utf8')]).toStrictEqual([
    'old delivery notes\n',
    'old release notes\n',
  ]);
});

test('#runStateTrim a dry run reports the plan and says nothing was written', () => {
  const ctx = setupTest();
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);

  const report = runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: true,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(report).toStrictEqual({
    role: 'kettle',
    file: join(ctx.directory, 'kettle.md'),
    dryRun: true,
    written: false,
    limitBytes: 16_384,
    beforeBytes: Buffer.byteLength(original),
    afterBytes: 16_349,
    entriesMoved: 10,
    archive: join(ctx.directory, 'kettle-archive-2026-10.md'),
    backup: join(ctx.directory, 'kettle.md.bak-20261031T010203Z'),
  });
});

test('#runStateTrim a dry run leaves the state file as it was', () => {
  const ctx = setupTest();
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);

  runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: true,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(readFileSync(join(ctx.directory, 'kettle.md'), 'utf8')).toBe(original);
});

test('#runStateTrim a dry run leaves the folder as it was', () => {
  const ctx = setupTest();
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);

  runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: true,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(readdirSync(ctx.directory)).toStrictEqual(['kettle.md']);
});

test('#runStateTrim a file already under its limit is left alone, with no backup', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle.md'), '## Log\n09:10Z boiled the water\n09:11Z poured the tea\n');

  runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(readdirSync(ctx.directory)).toStrictEqual(['kettle.md']);
});

test('it keeps the newest entry when the other sections alone leave the file over the limit', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle.md'), `${'cursor line\n'.repeat(2000)}## Log\n09:10Z boiled the water\n09:11Z poured the tea\n`);

  runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(readFileSync(join(ctx.directory, 'kettle.md'), 'utf8')).toEndWith('## Log\n09:11Z poured the tea\n');
});

test('it reports how far over the limit the file stays', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle.md'), `${'cursor line\n'.repeat(2000)}## Log\n09:10Z boiled the water\n09:11Z poured the tea\n`);

  const report = runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect([report.afterBytes, report.limitBytes]).toStrictEqual([24_029, 16_384]);
});

test('#runStateTrim delivery trims to 15 KB', () => {
  const ctx = setupTest();
  writeFileSync(
    join(ctx.directory, 'delivery.md'),
    `## Log\n${Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`).join('')}`,
  );

  const report = runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'delivery',
    actor: 'z-delivery',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect([report.limitBytes, report.entriesMoved, report.afterBytes]).toStrictEqual([15_360, 12, 15_211]);
});

test('#runStateTrim a file with no log section is refused in a real run', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle.md'), '# kettle\n\n## Cursors\nspout: 4\n');

  expect(() =>
    runStateTrim({
      directory: ctx.directory,
      roles: ['kettle', 'delivery'],
      role: 'kettle',
      actor: 'z-kettle',
      dryRun: false,
      at: new Date('2026-10-31T01:02:03Z'),
      files: buildNodeStateFiles(),
    }),
  ).toThrow('kettle.md has no "## Log" section, so hq state trim cannot trim it; trim it by hand');
});

test('#runStateTrim a file with no log section is refused in a dry run', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle.md'), '# kettle\n\n## Cursors\nspout: 4\n');

  expect(() =>
    runStateTrim({
      directory: ctx.directory,
      roles: ['kettle', 'delivery'],
      role: 'kettle',
      actor: 'z-kettle',
      dryRun: true,
      at: new Date('2026-10-31T01:02:03Z'),
      files: buildNodeStateFiles(),
    }),
  ).toThrow('kettle.md has no "## Log" section, so hq state trim cannot trim it; trim it by hand');
});

test('#runStateTrim a refused file gets no backup', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle.md'), '# kettle\n\n## Cursors\nspout: 4\n');

  expect(() =>
    runStateTrim({
      directory: ctx.directory,
      roles: ['kettle', 'delivery'],
      role: 'kettle',
      actor: 'z-kettle',
      dryRun: false,
      at: new Date('2026-10-31T01:02:03Z'),
      files: buildNodeStateFiles(),
    }),
  ).toThrow();
  expect(readdirSync(ctx.directory)).toStrictEqual(['kettle.md']);
});

test('#runStateTrim a role outside the fleet is refused', () => {
  const ctx = setupTest();
  expect(() =>
    runStateTrim({
      directory: ctx.directory,
      roles: ['kettle', 'delivery'],
      role: 'teapot',
      actor: 'z-teapot',
      dryRun: false,
      at: new Date('2026-10-31T01:02:03Z'),
      files: buildNodeStateFiles(),
    }),
  ).toThrow('teapot is not a fleet role');
});

test('#runStateTrim a role with no state file is refused', () => {
  const ctx = setupTest();
  expect(() =>
    runStateTrim({
      directory: ctx.directory,
      roles: ['kettle', 'delivery'],
      role: 'delivery',
      actor: 'z-delivery',
      dryRun: false,
      at: new Date('2026-10-31T01:02:03Z'),
      files: buildNodeStateFiles(),
    }),
  ).toThrow('delivery.md does not exist');
});

test('#runStateTrim a state file changed between the read and the replace is refused', () => {
  const ctx = setupTest();
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);
  const replacement = `${original}09:99Z another session wrote this\n`;

  expect(() =>
    runStateTrim({
      directory: ctx.directory,
      roles: ['kettle', 'delivery'],
      role: 'kettle',
      actor: 'z-kettle',
      dryRun: false,
      at: new Date('2026-10-31T01:02:03Z'),
      files: { ...buildNodeStateFiles(), readText: readChangingFile(join(ctx.directory, 'kettle.md'), replacement, 2) },
    }),
  ).toThrow('changed while hq state trim ran, so it was not replaced');
});

test('#runStateTrim a state file changed between the read and the replace keeps the other writer text', () => {
  const ctx = setupTest();
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);
  const replacement = `${original}09:99Z another session wrote this\n`;

  expect(() =>
    runStateTrim({
      directory: ctx.directory,
      roles: ['kettle', 'delivery'],
      role: 'kettle',
      actor: 'z-kettle',
      dryRun: false,
      at: new Date('2026-10-31T01:02:03Z'),
      files: { ...buildNodeStateFiles(), readText: readChangingFile(join(ctx.directory, 'kettle.md'), replacement, 2) },
    }),
  ).toThrow();
  expect(readFileSync(join(ctx.directory, 'kettle.md'), 'utf8')).toBe(replacement);
});

test('#runStateTrim an aborted replace tells the user to rerun', () => {
  const ctx = setupTest();
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);
  const replacement = `${original}09:99Z another session wrote this\n`;

  expect(() =>
    runStateTrim({
      directory: ctx.directory,
      roles: ['kettle', 'delivery'],
      role: 'kettle',
      actor: 'z-kettle',
      dryRun: false,
      at: new Date('2026-10-31T01:02:03Z'),
      files: { ...buildNodeStateFiles(), readText: readChangingFile(join(ctx.directory, 'kettle.md'), replacement, 2) },
    }),
  ).toThrow('Rerun hq state trim kettle');
});

test('#runStateTrim an aborted replace leaves the backup in place', () => {
  const ctx = setupTest();
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);
  const replacement = `${original}09:99Z another session wrote this\n`;

  expect(() =>
    runStateTrim({
      directory: ctx.directory,
      roles: ['kettle', 'delivery'],
      role: 'kettle',
      actor: 'z-kettle',
      dryRun: false,
      at: new Date('2026-10-31T01:02:03Z'),
      files: { ...buildNodeStateFiles(), readText: readChangingFile(join(ctx.directory, 'kettle.md'), replacement, 2) },
    }),
  ).toThrow();
  expect(readFileSync(join(ctx.directory, 'kettle.md.bak-20261031T010203Z'), 'utf8')).toBe(original);
});

test('#runStateTrim an aborted replace leaves the archive append in place', () => {
  const ctx = setupTest();
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);
  const replacement = `${original}09:99Z another session wrote this\n`;

  expect(() =>
    runStateTrim({
      directory: ctx.directory,
      roles: ['kettle', 'delivery'],
      role: 'kettle',
      actor: 'z-kettle',
      dryRun: false,
      at: new Date('2026-10-31T01:02:03Z'),
      files: { ...buildNodeStateFiles(), readText: readChangingFile(join(ctx.directory, 'kettle.md'), replacement, 2) },
    }),
  ).toThrow();
  expect(readFileSync(join(ctx.directory, 'kettle-archive-2026-10.md'), 'utf8')).toBe(`<!-- moved from kettle.md by hq state trim at 2026-10-31T01:02:03Z -->\n${entries.slice(0, 10).join('')}`);
});

test('#runStateTrim an aborted replace leaves no temp file behind', () => {
  const ctx = setupTest();
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);
  const replacement = `${original}09:99Z another session wrote this\n`;

  expect(() =>
    runStateTrim({
      directory: ctx.directory,
      roles: ['kettle', 'delivery'],
      role: 'kettle',
      actor: 'z-kettle',
      dryRun: false,
      at: new Date('2026-10-31T01:02:03Z'),
      files: { ...buildNodeStateFiles(), readText: readChangingFile(join(ctx.directory, 'kettle.md'), replacement, 2) },
    }),
  ).toThrow();
  expect(readdirSync(ctx.directory).toSorted()).toStrictEqual(['kettle-archive-2026-10.md', 'kettle.md', 'kettle.md.bak-20261031T010203Z']);
});

test('it creates the archive with the mode of a private state file', () => {
  const ctx = setupTest();
  const previous = process.umask(0o022);
  onTestFinished(() => process.umask(previous));
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);
  chmodSync(join(ctx.directory, 'kettle.md'), 0o600);

  runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(statSync(join(ctx.directory, 'kettle-archive-2026-10.md')).mode & 0o777).toBe(0o600);
});

test('it replaces a private state file with the same mode', () => {
  const ctx = setupTest();
  const previous = process.umask(0o022);
  onTestFinished(() => process.umask(previous));
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);
  chmodSync(join(ctx.directory, 'kettle.md'), 0o600);

  runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(statSync(join(ctx.directory, 'kettle.md')).mode & 0o777).toBe(0o600);
});

test('it gives the backup the mode of a private state file', () => {
  const ctx = setupTest();
  const previous = process.umask(0o022);
  onTestFinished(() => process.umask(previous));
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  const original = `${head}## Log\n${entries.join('')}${tail}`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);
  chmodSync(join(ctx.directory, 'kettle.md'), 0o600);

  runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(statSync(join(ctx.directory, 'kettle.md.bak-20261031T010203Z')).mode & 0o777).toBe(0o600);
});

test('it narrows an existing wider archive to the mode of a private state file', () => {
  const ctx = setupTest();
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  writeFileSync(join(ctx.directory, 'kettle.md'), `${head}## Log\n${entries.join('')}${tail}`);
  chmodSync(join(ctx.directory, 'kettle.md'), 0o600);
  writeFileSync(join(ctx.directory, 'kettle-archive-2026-10.md'), '08:00Z filled the kettle\n');
  chmodSync(join(ctx.directory, 'kettle-archive-2026-10.md'), 0o644);

  runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(statSync(join(ctx.directory, 'kettle-archive-2026-10.md')).mode & 0o777).toBe(0o600);
});

test('it leaves an existing archive that is already narrower than the state file as it is', () => {
  const ctx = setupTest();
  const head = '# kettle\n\n## Cursors\nspout: 4\n\n';
  const entries = Array.from({ length: 40 }, (_unused, index) => `09:${String(index).padStart(2, '0')}Z boiled the water ${'x'.repeat(500)}\n  and then waited\n`);
  const tail = '\n## Holds\nlid: stuck\n';
  writeFileSync(join(ctx.directory, 'kettle.md'), `${head}## Log\n${entries.join('')}${tail}`);
  chmodSync(join(ctx.directory, 'kettle.md'), 0o644);
  writeFileSync(join(ctx.directory, 'kettle-archive-2026-10.md'), '08:00Z filled the kettle\n');
  chmodSync(join(ctx.directory, 'kettle-archive-2026-10.md'), 0o600);

  runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(statSync(join(ctx.directory, 'kettle-archive-2026-10.md')).mode & 0o777).toBe(0o600);
});

test('#runStateTrim a real trim by a session other than the role owner is refused', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle.md'), `## Log\n${'09:10Z boiled the water\n'.repeat(1000)}09:11Z poured the tea\n`);

  expect(() =>
    runStateTrim({
      directory: ctx.directory,
      roles: ['kettle', 'delivery'],
      role: 'kettle',
      actor: 'z-delivery',
      dryRun: false,
      at: new Date('2026-10-31T01:02:03Z'),
      files: buildNodeStateFiles(),
    }),
  ).toThrow('only z-kettle may trim kettle.md, not z-delivery; anyone may run hq state trim kettle --dry-run');
});

test('#runStateTrim a refused trim by another session writes nothing', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle.md'), `## Log\n${'09:10Z boiled the water\n'.repeat(1000)}09:11Z poured the tea\n`);

  expect(() =>
    runStateTrim({
      directory: ctx.directory,
      roles: ['kettle', 'delivery'],
      role: 'kettle',
      actor: 'z-delivery',
      dryRun: false,
      at: new Date('2026-10-31T01:02:03Z'),
      files: buildNodeStateFiles(),
    }),
  ).toThrow();
  expect(readdirSync(ctx.directory)).toStrictEqual(['kettle.md']);
});

test('#runStateTrim the role owner session may run a real trim', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle.md'), `## Log\n${'09:10Z boiled the water\n'.repeat(1000)}09:11Z poured the tea\n`);

  const report = runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-kettle',
    dryRun: false,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(report.written).toBe(true);
});

test('#runStateTrim any session may run a dry run of another role', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle.md'), `## Log\n${'09:10Z boiled the water\n'.repeat(1000)}09:11Z poured the tea\n`);

  const report = runStateTrim({
    directory: ctx.directory,
    roles: ['kettle', 'delivery'],
    role: 'kettle',
    actor: 'z-delivery',
    dryRun: true,
    at: new Date('2026-10-31T01:02:03Z'),
    files: buildNodeStateFiles(),
  });

  expect(report.entriesMoved).toBe(319);
});

test('#runStateTrim a backup already at the target path stops the trim before anything changes', () => {
  const ctx = setupTest();
  const original = `## Log\n${'09:10Z boiled the water\n'.repeat(1000)}09:11Z poured the tea\n`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);
  writeFileSync(join(ctx.directory, 'kettle-archive-2026-10.md'), '08:00Z filled the kettle\n');
  writeFileSync(join(ctx.directory, 'kettle.md.bak-20261031T010203Z'), '# an older backup\n');

  expect(() =>
    runStateTrim({
      directory: ctx.directory,
      roles: ['kettle', 'delivery'],
      role: 'kettle',
      actor: 'z-kettle',
      dryRun: false,
      at: new Date('2026-10-31T01:02:03Z'),
      files: buildNodeStateFiles(),
    }),
  ).toThrow('EEXIST');
  expect(readFileSync(join(ctx.directory, 'kettle.md'), 'utf8')).toBe(original);
  expect(readFileSync(join(ctx.directory, 'kettle-archive-2026-10.md'), 'utf8')).toBe('08:00Z filled the kettle\n');
  expect(readFileSync(join(ctx.directory, 'kettle.md.bak-20261031T010203Z'), 'utf8')).toBe('# an older backup\n');
});

test('#runStateTrim a failed archive append leaves the state file as it was', () => {
  const ctx = setupTest();
  const original = `## Log\n${'09:10Z boiled the water\n'.repeat(1000)}09:11Z poured the tea\n`;
  writeFileSync(join(ctx.directory, 'kettle.md'), original);

  expect(() =>
    runStateTrim({
      directory: ctx.directory,
      roles: ['kettle', 'delivery'],
      role: 'kettle',
      actor: 'z-kettle',
      dryRun: false,
      at: new Date('2026-10-31T01:02:03Z'),
      files: {
        ...buildNodeStateFiles(),
        appendText: () => {
          throw new Error('ENOSPC: no space left on device');
        },
      },
    }),
  ).toThrow('ENOSPC');
  expect(readFileSync(join(ctx.directory, 'kettle.md'), 'utf8')).toBe(original);
});

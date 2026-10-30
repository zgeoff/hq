import { expect, test } from 'bun:test';
import { buildStubFailingAtcMcpFiles } from './build-stub-failing-atc-mcp-files.ts';

test('it passes a read of an unlisted path through to the wrapped files', () => {
  const files = buildStubFailingAtcMcpFiles(
    { procRoot: '/proc', readFile: () => 'btime 7\n', readdir: () => ['9'], readlink: () => '/opt/kettle/atc', mtimeMs: () => 4200, whichAtc: () => '/opt/kettle/atc' },
    { '/proc/9/exe': 'ESRCH' },
  );

  expect(files.readFile('/proc/stat')).toBe('btime 7\n');
});

test('it keeps the wrapped proc root', () => {
  const files = buildStubFailingAtcMcpFiles(
    { procRoot: '/srv/proc', readFile: () => 'btime 7\n', readdir: () => ['9'], readlink: () => '/opt/kettle/atc', mtimeMs: () => 4200, whichAtc: () => '/opt/kettle/atc' },
    {},
  );

  expect(files.procRoot).toBe('/srv/proc');
});

test('it keeps the wrapped PATH lookup', () => {
  const files = buildStubFailingAtcMcpFiles(
    { procRoot: '/proc', readFile: () => 'btime 7\n', readdir: () => ['9'], readlink: () => '/opt/kettle/atc', mtimeMs: () => 4200, whichAtc: () => '/opt/kettle/atc' },
    {},
  );

  expect(files.whichAtc()).toBe('/opt/kettle/atc');
});

test.each([
  ['readFile', 'open'],
  ['readdir', 'scandir'],
  ['readlink', 'readlink'],
  ['mtimeMs', 'stat'],
] as const)('it throws the listed code from %s with the node:fs message for its %s call', (operation, syscall) => {
  const files = buildStubFailingAtcMcpFiles(
    { procRoot: '/proc', readFile: () => 'btime 7\n', readdir: () => ['9'], readlink: () => '/opt/kettle/atc', mtimeMs: () => 4200, whichAtc: () => '/opt/kettle/atc' },
    { '/proc/9/exe': 'ESRCH' },
  );

  expect(() => files[operation]('/proc/9/exe')).toThrow(expect.objectContaining({ code: 'ESRCH', message: `ESRCH: no such process, ${syscall} '/proc/9/exe'` }));
});

test('it describes an EIO failure as node:fs does', () => {
  const files = buildStubFailingAtcMcpFiles(
    { procRoot: '/proc', readFile: () => 'btime 7\n', readdir: () => ['9'], readlink: () => '/opt/kettle/atc', mtimeMs: () => 4200, whichAtc: () => '/opt/kettle/atc' },
    { '/proc/9/cmdline': 'EIO' },
  );

  expect(() => files.readFile('/proc/9/cmdline')).toThrow(expect.objectContaining({ code: 'EIO', message: "EIO: i/o error, open '/proc/9/cmdline'" }));
});

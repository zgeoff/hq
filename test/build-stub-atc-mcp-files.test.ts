import { expect, test } from 'bun:test';
import { buildStubAtcMcpFiles } from './build-stub-atc-mcp-files.ts';

test('it reads a file from the files table', () => {
  const files = buildStubAtcMcpFiles({ atc: null, files: { '/proc/9/cmdline': 'atc\0mcp\0' } });

  expect(files.readFile('/proc/9/cmdline')).toBe('atc\0mcp\0');
});

test('it reads a link target from the links table', () => {
  const files = buildStubAtcMcpFiles({ atc: null, links: { '/proc/9/exe': '/opt/kettle/atc' } });

  expect(files.readlink('/proc/9/exe')).toBe('/opt/kettle/atc');
});

test('it reads a modification time from the mtimes table', () => {
  const files = buildStubAtcMcpFiles({ atc: null, mtimes: { '/opt/kettle/atc': 4200 } });

  expect(files.mtimeMs('/opt/kettle/atc')).toBe(4200);
});

test('it answers the PATH lookup with the given atc path', () => {
  const files = buildStubAtcMcpFiles({ atc: '/opt/kettle/atc' });

  expect(files.whichAtc()).toBe('/opt/kettle/atc');
});

test('it lists each name below a directory once, from every table', () => {
  const files = buildStubAtcMcpFiles({ atc: null, files: { '/proc/stat': 'btime 7\n', '/proc/9/cmdline': '', '/proc/9/stat': '' }, links: { '/proc/12/exe': '/x' }, failures: { '/proc/31/cmdline': 'EACCES' } });

  expect(files.readdir('/proc')).toStrictEqual(['stat', '9', '12', '31']);
});

test('it throws ENOENT with the node:fs message for a path in no table', () => {
  const files = buildStubAtcMcpFiles({ atc: null });

  expect(() => files.readFile('/proc/9/cgroup')).toThrow(expect.objectContaining({ code: 'ENOENT', message: "ENOENT: no such file or directory, open '/proc/9/cgroup'" }));
});

test('it throws ENOENT when listing a directory with nothing below it', () => {
  const files = buildStubAtcMcpFiles({ atc: null, files: { '/procs/stat': '' } });

  expect(() => files.readdir('/proc')).toThrow(expect.objectContaining({ code: 'ENOENT', message: "ENOENT: no such file or directory, scandir '/proc'" }));
});

test('it throws the given errno code for a failing path, over its table entry', () => {
  const files = buildStubAtcMcpFiles({ atc: null, links: { '/proc/9/exe': '/x' }, failures: { '/proc/9/exe': 'EACCES' } });

  expect(() => files.readlink('/proc/9/exe')).toThrow(expect.objectContaining({ code: 'EACCES', message: "EACCES: permission denied, readlink '/proc/9/exe'" }));
});

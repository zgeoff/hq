import { expect, test } from 'bun:test';
import { isGateTouched } from './is-gate-touched.ts';

test.each([
  ['a file deep under a ** path', ['nixos/hosts/kettle/configuration.nix'], true],
  ['a file that a path names exactly', ['bun.lock'], true],
  ['only files outside every path', ['docs/kettle.md', 'packages/teapot/a.ts'], false],
  ['a file that only an ignore glob also matches', ['nixos/README.md'], false],
  ['one matching file among others', ['docs/kettle.md', 'nixos/flake.lock'], true],
  ['no files', [], false],
])('it answers for %s', (_, files: string[], touched) => {
  expect(isGateTouched({ paths: ['nixos/**', 'bun.lock'], ignore: ['**/*.md'] }, files)).toBe(touched);
});

test('it keeps a single * inside one directory', () => {
  expect(isGateTouched({ paths: ['scripts/*.sh'], ignore: [] }, ['scripts/host/write-kettle-token.sh'])).toBe(false);
});

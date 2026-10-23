import { expect, test } from 'bun:test';
import { parseGate } from './parse-gate.ts';

test('it reads the paths and ignore globs of the named gate', () => {
  const gates = Buffer.from(['gates:', '  docs:', '    paths:', "      - '**'", '  host:', '    skipped: No host input changed.', '    paths:', '      - nixos/**', '      - bun.lock', '    ignore:', "      - '**/*.md'", ''].join('\n')).toString('base64');

  expect(parseGate(gates, 'host')).toStrictEqual({ paths: ['nixos/**', 'bun.lock'], ignore: ['**/*.md'] });
});

test('it reads a gate with no ignore globs as ignoring nothing', () => {
  const gates = Buffer.from(['gates:', '  host:', '    paths:', '      - nixos/**', ''].join('\n')).toString('base64');

  expect(parseGate(gates, 'host')).toStrictEqual({ paths: ['nixos/**'], ignore: [] });
});

test('it reads base64 that GitHub wraps across lines', () => {
  const gates = Buffer.from(['gates:', '  host:', '    paths:', '      - nixos/**', '      - packages/kettle/**', ''].join('\n'))
    .toString('base64')
    .replaceAll(/(?<chunk>.{20})/gu, '$<chunk>\n');

  expect(parseGate(gates, 'host')).toStrictEqual({ paths: ['nixos/**', 'packages/kettle/**'], ignore: [] });
});

test('it refuses a file with no gate of that name', () => {
  const gates = Buffer.from(['gates:', '  docs:', '    paths:', "      - '**'", ''].join('\n')).toString('base64');

  expect(() => parseGate(gates, 'host')).toThrow('.github/gates.yml has no host gate');
});

test('it refuses a gate with no paths', () => {
  const gates = Buffer.from(['gates:', '  host:', '    paths: []', ''].join('\n')).toString('base64');

  expect(() => parseGate(gates, 'host')).toThrow('.github/gates.yml is not the expected shape');
});

test('it refuses a file that is not YAML', () => {
  const gates = Buffer.from('gates: [kettle: {').toString('base64');

  expect(() => parseGate(gates, 'host')).toThrow('.github/gates.yml is not YAML');
});

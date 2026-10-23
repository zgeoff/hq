import { expect, test } from 'bun:test';
import { parseLineSegments } from './parse-line-segments.ts';

test('it sets apart a version, a code span and a link destination', () => {
  expect(parseLineSegments('Run `bun test` on bun 1.3.4 and see [the kettle](docs/kettle.md#boil).')).toStrictEqual([
    { kind: 'text', value: 'Run ' },
    { kind: 'code', value: '`bun test`' },
    { kind: 'text', value: ' on bun ' },
    { kind: 'version', value: '1.3.4' },
    { kind: 'text', value: ' and see [the kettle](' },
    { kind: 'dest', value: 'docs/kettle.md#boil' },
    { kind: 'text', value: ').' },
  ]);
});

test('it reads a reference definition destination', () => {
  expect(parseLineSegments('[kettle]: docs/kettle.md')).toStrictEqual([
    { kind: 'text', value: '[kettle]: ' },
    { kind: 'dest', value: 'docs/kettle.md' },
  ]);
});

test('it leaves a number that is not a version in the text', () => {
  expect(parseLineSegments('Boil 3 cups, then wait 10 minutes')).toStrictEqual([{ kind: 'text', value: 'Boil 3 cups, then wait 10 minutes' }]);
});

test('it reads a pre-release version whole', () => {
  expect(parseLineSegments('v2.0.0-rc.1.')).toStrictEqual([
    { kind: 'version', value: 'v2.0.0-rc.1' },
    { kind: 'text', value: '.' },
  ]);
});

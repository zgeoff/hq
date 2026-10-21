import { expect, test } from 'bun:test';
import { parseChangedPrefixes } from './parse-changed-prefixes.ts';

test('it picks the prefixes of the packages a PR changed', () => {
  const config = Buffer.from(JSON.stringify({ packages: { 'packages/alpha': { component: 'alpha' }, 'packages/beta': { 'package-name': 'beta' } } })).toString('base64');

  expect(parseChangedPrefixes(config, ['packages/alpha/a.ts'])).toStrictEqual(['alpha@']);
});

test('it refuses a changed package with neither component nor package-name', () => {
  const config = Buffer.from(JSON.stringify({ packages: { 'packages/alpha': {} } })).toString('base64');

  expect(() => parseChangedPrefixes(config, ['packages/alpha/a.ts'])).toThrow('release-please package packages/alpha has no component or package-name');
});

test('it refuses a config that is not JSON', () => {
  const config = Buffer.from('not json').toString('base64');

  expect(() => parseChangedPrefixes(config, ['packages/alpha/a.ts'])).toThrow('release-please-config.json is not JSON');
});

test('it refuses a config whose packages are not a map', () => {
  const config = Buffer.from(JSON.stringify({ packages: [] })).toString('base64');

  expect(() => parseChangedPrefixes(config, ['packages/alpha/a.ts'])).toThrow('release-please-config.json is not the expected shape');
});

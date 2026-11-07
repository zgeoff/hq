import { expect, test } from 'bun:test';
import { readSpawnedNames } from './read-spawned-names.ts';

test('it reads the name of each spawn call, in call order, and skips other calls', () => {
  const calls = [
    { method: 'session.spawn', input: { name: 'z-kettle', cwd: '/srv/kettle' } },
    { method: 'session.kill', input: { session: 'id-teapot' } },
    { method: 'session.spawn', input: { name: 'z-teapot' } },
  ];

  expect(readSpawnedNames({ calls })).toStrictEqual(['z-kettle', 'z-teapot']);
});

test('it throws on a spawn call whose input has no name', () => {
  const calls = [{ method: 'session.spawn', input: { cwd: '/srv/kettle' } }];

  expect(() => readSpawnedNames({ calls })).toThrow(/name/u);
});

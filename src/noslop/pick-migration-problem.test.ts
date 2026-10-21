import { expect, test } from 'bun:test';
import { pickMigrationProblem } from './pick-migration-problem.ts';

test('it names a new migration the store does not hold after the run', () => {
  expect(pickMigrationProblem(['0007-teapots', '0008-saucers'], ['0006-cups', '0007-teapots'], { cups: 2 }, { cups: 2 })).toBe('the store does not hold the migration 0008-saucers after the run');
});

test('it names each table that lost rows, with its counts before and after', () => {
  expect(pickMigrationProblem(['0007-teapots'], ['0006-cups', '0007-teapots'], { cups: 3, saucers: 2, spoons: 4 }, { cups: 1, saucers: 2 })).toBe('the migration lost rows: cups 3 -> 1, spoons 4 -> 0');
});

test('it finds no problem when every new migration is held and no table lost rows', () => {
  expect(pickMigrationProblem(['0007-teapots'], ['0006-cups', '0007-teapots'], { cups: 3 }, { cups: 4, teapots: 1 })).toBeNull();
});

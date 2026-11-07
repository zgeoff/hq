import { expect, test } from 'bun:test';
import { buildStubImpzRunner } from '../../test/build-stub-impz-runner.ts';
import type { Runner } from '../runner/types.ts';
import { readImpd } from './read-impd.ts';

test('it reads the RAM impd keeps for priority imps from impz info', async () => {
  const run = buildStubImpzRunner({ info: { ramBudgetMib: 20_480, ramUsedMib: 12_288, ramCommittedMib: 14_336, ramPriorityKeptMib: 3072 }, imps: [] });

  const result = await readImpd({ run, readText: () => Promise.resolve(''), readFile: () => Promise.resolve('') });

  expect(result).toStrictEqual({
    impd: { budgetMib: 20_480, usedMib: 12_288, committedMib: 14_336, nonnixAwakeMib: 0, nonnixAwakeVcpus: 0, nixAwakeMib: 0, priorityKeptMib: 3072 },
    error: null,
  });
});

test('it reads no kept RAM from an impz info that does not print it', async () => {
  const run = buildStubImpzRunner({ info: { ramBudgetMib: 20_480, ramUsedMib: 12_288, ramCommittedMib: 14_336 }, imps: [] });

  const result = await readImpd({ run, readText: () => Promise.resolve(''), readFile: () => Promise.resolve('') });

  expect(result.impd.priorityKeptMib).toBe(0);
});

test('it reads no impd budget, and says why, when impz info prints a kept RAM that is not a number', async () => {
  const run = buildStubImpzRunner({ info: { ramBudgetMib: 20_480, ramUsedMib: 12_288, ramCommittedMib: 14_336, ramPriorityKeptMib: '3072' }, imps: [] });

  const result = await readImpd({ run, readText: () => Promise.resolve(''), readFile: () => Promise.resolve('') });

  expect(result).toStrictEqual({
    impd: { budgetMib: null, usedMib: null, committedMib: null, nonnixAwakeMib: 0, nonnixAwakeVcpus: 0, nixAwakeMib: 0, priorityKeptMib: null },
    error: 'impz info has a ramPriorityKeptMib that is not a number',
  });
});

test('it says impz info printed no object when it prints a list', async () => {
  const stdout = new Map([
    ['info', '[]'],
    ['ls', '[]'],
  ]);
  const run: Runner = (command) => Promise.resolve({ code: 0, stdout: stdout.get(command[1] ?? '') ?? '', stderr: '' });

  const result = await readImpd({ run, readText: () => Promise.resolve(''), readFile: () => Promise.resolve('') });

  expect(result.error).toBe('impz info did not print an object');
});

test('it says impz ls printed no list when it prints an object', async () => {
  const stdout = new Map([
    ['info', '{"ramBudgetMib":20480,"ramUsedMib":12288}'],
    ['ls', '{}'],
  ]);
  const run: Runner = (command) => Promise.resolve({ code: 0, stdout: stdout.get(command[1] ?? '') ?? '', stderr: '' });

  const result = await readImpd({ run, readText: () => Promise.resolve(''), readFile: () => Promise.resolve('') });

  expect(result.error).toBe('impz ls did not print a list');
});

test('it counts only the running imps when impz ls lists an entry that is not an object', async () => {
  const stdout = new Map([
    ['info', '{"ramBudgetMib":20480,"ramUsedMib":12288}'],
    ['ls', JSON.stringify([null, 'x', { name: 'kettle-1', state: 'running', memoryMib: 2048, vcpus: 2 }])],
  ]);
  const run: Runner = (command) => Promise.resolve({ code: 0, stdout: stdout.get(command[1] ?? '') ?? '', stderr: '' });

  const result = await readImpd({ run, readText: () => Promise.resolve(''), readFile: () => Promise.resolve('') });

  expect(result.impd.nonnixAwakeMib).toBe(2048);
});

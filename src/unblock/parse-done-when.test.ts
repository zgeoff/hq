import { expect, test } from 'bun:test';
import type { DoneWhen } from './types.ts';
import { parseDoneWhen } from './parse-done-when.ts';

test.each<[string, DoneWhen]>([
  ['issue:GEO-1638', { kind: 'issue', ref: 'GEO-1638' }],
  ['issue:ket-7', { kind: 'issue', ref: 'KET-7' }],
  ['pr:kettle#4', { kind: 'pr', ref: 'zgeoff/kettle#4' }],
  ['pr:kettle-co/kettle#4', { kind: 'pr', ref: 'kettle-co/kettle#4' }],
  ['doc:descaling-plan-abc123def456', { kind: 'doc', ref: 'descaling-plan-abc123def456' }],
  ['doc:https://linear.app/kettle/document/descaling-plan-abc123def456', { kind: 'doc', ref: 'https://linear.app/kettle/document/descaling-plan-abc123def456' }],
])('it reads %s', (raw, expected) => {
  expect(parseDoneWhen(raw)).toStrictEqual(expected);
});

test.each(['foo:1', 'issue:', 'pr:widgets', 'issue:kettle', 'pr:kettle#x', 'doc:', 'doc:two words', 'GEO-1'])('it refuses %s as bad_args', (raw) => {
  expect(() => parseDoneWhen(raw)).toThrow(/cannot read --done-when/u);
});

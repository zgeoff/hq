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
  ['release:kettle', { kind: 'release', ref: 'zgeoff/kettle' }],
  ['release:kettle-co/kettle', { kind: 'release', ref: 'kettle-co/kettle' }],
  ['date:2026-11-02T09:00:00.000Z', { kind: 'date', ref: '2026-11-02T09:00:00Z' }],
  ['date:2026-11-02T20:00:00+11:00', { kind: 'date', ref: '2026-11-02T09:00:00Z' }],
])('it reads %s', (raw, expected) => {
  expect(parseDoneWhen(raw)).toStrictEqual(expected);
});

test.each(['foo:1', 'issue:', 'pr:widgets', 'issue:kettle', 'pr:kettle#x', 'doc:', 'doc:two words', 'GEO-1', 'release:', 'release:kettle#4', 'date:tomorrow', 'date:2026-11-02', 'date:2026-13-02T09:00:00Z'])('it refuses %s as bad_args', (raw) => {
  expect(() => parseDoneWhen(raw)).toThrow(/cannot read --done-when/u);
});

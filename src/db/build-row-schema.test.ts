import { expect, test } from 'bun:test';
import type { Selectable } from 'kysely';
import type { z } from 'zod';
import { buildRowSchema } from './build-row-schema.ts';
import type { HqTables } from './hq-columns.ts';
import { HQ_COLUMNS } from './hq-columns.ts';

test('it builds a schema with one key for every column of the table', () => {
  expect(Object.keys(buildRowSchema('news').shape)).toStrictEqual(Object.keys(HQ_COLUMNS.news));
});

test('it outputs the row type of the table it was built for', () => {
  const schemas = [
    buildRowSchema('runs') satisfies z.ZodType<Selectable<HqTables['runs']>>,
    buildRowSchema('asks') satisfies z.ZodType<Selectable<HqTables['asks']>>,
    buildRowSchema('outbox') satisfies z.ZodType<Selectable<HqTables['outbox']>>,
    buildRowSchema('slot_minutes') satisfies z.ZodType<Selectable<HqTables['slot_minutes']>>,
  ];

  expect(schemas.map((schema) => Object.keys(schema.shape).length)).toStrictEqual([
    Object.keys(HQ_COLUMNS.runs).length,
    Object.keys(HQ_COLUMNS.asks).length,
    Object.keys(HQ_COLUMNS.outbox).length,
    Object.keys(HQ_COLUMNS.slot_minutes).length,
  ]);
});

test.each([
  { name: 'a text column', table: 'meta', row: { key: 'schema', value: 'v1' }, ok: true },
  { name: 'a text column given a number', table: 'meta', row: { key: 'schema', value: 3 }, ok: false },
  { name: 'a required column that is missing', table: 'meta', row: { key: 'schema' }, ok: false },
  { name: 'a real column', table: 'slot_minutes', row: { day: '2026-11-02', cause: 'design', minutes: 1.5 }, ok: true },
  { name: 'a real column given text', table: 'slot_minutes', row: { day: '2026-11-02', cause: 'design', minutes: '1.5' }, ok: false },
  { name: 'a union column with a listed value', table: 'slot_minutes', row: { day: '2026-11-02', cause: 'triage', minutes: 1 }, ok: true },
  { name: 'a union column with an unlisted value', table: 'slot_minutes', row: { day: '2026-11-02', cause: 'rest', minutes: 1 }, ok: false },
  {
    name: 'a generated column',
    table: 'outbox',
    row: { id: 4, event_seq: 9, target: 's', text: 't', idem_key: 'k', status: 'pending', attempts: 0, last_error: null, message_id: null, created_at: 'c', sent_at: null, topic: null },
    ok: true,
  },
  {
    name: 'a generated column given text',
    table: 'outbox',
    row: { id: '4', event_seq: 9, target: 's', text: 't', idem_key: 'k', status: 'pending', attempts: 0, last_error: null, message_id: null, created_at: 'c', sent_at: null, topic: null },
    ok: false,
  },
  {
    name: 'a nullable text column holding a string',
    table: 'outbox',
    row: { id: 4, event_seq: 9, target: 's', text: 't', idem_key: 'k', status: 'sent', attempts: 0, last_error: null, message_id: null, created_at: 'c', sent_at: null, topic: 'x' },
    ok: true,
  },
  {
    name: 'a required text column holding null',
    table: 'outbox',
    row: { id: 4, event_seq: 9, target: null, text: 't', idem_key: 'k', status: 'pending', attempts: 0, last_error: null, message_id: null, created_at: 'c', sent_at: null, topic: null },
    ok: false,
  },
  {
    name: 'a union column that is not nullable holding null',
    table: 'outbox',
    row: { id: 4, event_seq: 9, target: 's', text: 't', idem_key: 'k', status: null, attempts: 0, last_error: null, message_id: null, created_at: 'c', sent_at: null, topic: null },
    ok: false,
  },
  { name: 'a nullable integer column holding null', table: 'lanes_samples', row: { seq: 1, at: 'a', free_mib: null, slots: 1, eligible: null, error: null }, ok: true },
  {
    name: 'a nullable real column holding null',
    table: 'usage_samples',
    row: { at: 'a', account: 'x', five_hour: null, seven_day: null, five_hour_resets_at: null, seven_day_resets_at: null },
    ok: true,
  },
  {
    name: 'a nullable union column holding null',
    table: 'pr_status',
    row: {
      repo: 'r',
      pr: 1,
      head: null,
      gate: null,
      gate_head: null,
      gate_at: null,
      answer: 'lgtm',
      answer_head: null,
      answer_source: null,
      answer_note: null,
      answer_at: null,
      next: null,
      next_at: null,
      updated_at: 'u',
    },
    ok: true,
  },
] as const)('it parses $name as ok=$ok', (testCase) => {
  expect(buildRowSchema(testCase.table).safeParse(testCase.row).success).toBe(testCase.ok);
});

test('it lets a caller pick the columns of a partial select', () => {
  const schema = buildRowSchema('meta').pick({ key: true });

  expect(schema.parse({ key: 'schema', value: 'v1' })).toStrictEqual({ key: 'schema' });
});

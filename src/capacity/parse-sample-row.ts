import { z } from 'zod';
import { buildJSONColumn } from '../db/build-json-column.ts';
import type { CapacitySampleRow } from '../kdb.ts';
import type { Reading } from './types.ts';

const ErrorsColumn = buildJSONColumn(z.record(z.string(), z.string()));

export function parseSampleRow(row: CapacitySampleRow): Reading {
  return { ...row, errors: ErrorsColumn.parse(row.errors || '{}') };
}

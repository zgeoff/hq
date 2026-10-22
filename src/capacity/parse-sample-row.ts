import type { CapacitySampleRow } from '../kdb.ts';
import type { Errors, Reading } from './types.ts';

export function parseSampleRow(row: CapacitySampleRow): Reading {
  return { ...row, errors: JSON.parse(row.errors || '{}') as Errors };
}

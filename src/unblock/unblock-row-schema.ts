import { z } from 'zod';
import { buildJSONColumn } from '../db/build-json-column.ts';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { PRIORITIES } from './priorities.ts';
import type { DoneWhen } from './types.ts';

const DoneWhenSchema = z.array(z.object({ kind: z.enum(['issue', 'pr', 'doc', 'release', 'date']), ref: z.string() }));

// A condition column nothing can read counts as no conditions, so one bad row never hides the list.
const DoneWhenColumnSchema = z.string().nullable().transform(parseDoneWhenColumn);

const UnblockedItemSchema = z.object({ issue: z.string(), priority: z.enum(PRIORITIES) });
const UnblockedSchema = buildJSONColumn(z.array(UnblockedItemSchema));
const NotifySchema = buildJSONColumn(z.array(z.string()));

export const UnblockRowSchema = buildRowSchema('unblocks').extend({ unblocks: UnblockedSchema, notify: NotifySchema, done_when: DoneWhenColumnSchema });

function parseDoneWhenColumn(column: string | null): DoneWhen[] {
  if (column === null) {
    return [];
  }
  try {
    const parsed = DoneWhenSchema.safeParse(JSON.parse(column));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

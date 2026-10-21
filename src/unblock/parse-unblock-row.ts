import { z } from 'zod';
import type { DoneWhen, Row, UnblockItem } from './types.ts';

export function parseUnblockRow(r: Row): UnblockItem {
  return { ...r, unblocks: JSON.parse(r.unblocks), notify: JSON.parse(r.notify), done_when: parseDoneWhenColumn(r.done_when) };
}

const doneWhenSchema = z.array(z.object({ kind: z.enum(['issue', 'pr', 'doc']), ref: z.string() }));

function parseDoneWhenColumn(column: string | null): DoneWhen[] {
  if (column === null) {
    return [];
  }
  try {
    const parsed = doneWhenSchema.safeParse(JSON.parse(column));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

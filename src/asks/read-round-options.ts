import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import type { ItemOption } from '../parse-item-input.ts';
import { parseStoredExtras } from '../parse-stored-extras.ts';

const RoundEventSchema = z.object({ action: z.string(), data: z.string() }).nullable();

const ItemDataSchema = z.object({ item: z.string() });

export function readRoundOptions(db: Database, id: string, beforeSeq: number): ItemOption[] {
  const row = RoundEventSchema.parse(
    db
      .query("SELECT action, data FROM events WHERE subject = 'ask' AND subject_id = ? AND (action IN ('item', 'reasked') OR (action = 'updated' AND json_extract(data, '$.itemCleared') = 1)) AND seq < ? ORDER BY seq DESC LIMIT 1")
      .get(id, beforeSeq),
  );
  if (row === null || row.action !== 'item') {
    return [];
  }
  return parseStoredExtras(ItemDataSchema.parse(JSON.parse(row.data)).item)?.options ?? [];
}

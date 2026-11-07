import { z } from 'zod';

const RecordSchema = z.object({ uuid: z.string().optional(), parentUuid: z.string().nullable().optional() });

export function findParentUUID(transcript: string, uuid: string): string | null | undefined {
  const records = transcript
    .split('\n')
    .filter(Boolean)
    .map((line) => RecordSchema.parse(JSON.parse(line)));
  return records.find((record) => record.uuid === uuid)?.parentUuid;
}

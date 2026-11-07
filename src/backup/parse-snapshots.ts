import { z } from 'zod';
import { HqError } from '../errors.ts';
import { parseJSON } from '../noslop/parse-json.ts';

const SnapshotSchema = z.object({ short_id: z.string(), time: z.string(), paths: z.array(z.string()) });
const SnapshotListSchema = z.array(SnapshotSchema);

export function parseSnapshots(stdout: string): z.output<typeof SnapshotListSchema> {
  const parsed = SnapshotListSchema.safeParse(parseJSON(stdout));
  if (!parsed.success) {
    throw new HqError('restic_bad_output', `restic snapshots did not print a snapshot list: ${stdout.trim().slice(0, 200)}`);
  }
  return parsed.data;
}

import type { Role } from '../roles/role-names.ts';
import { readReferenceCounts } from './read-reference-counts.ts';
import type { ReferenceOptions } from './types.ts';

// The (role, reference) pairs no session of the role opened in the window: for the daily goals line.
export async function readUnopenedReferences(options: ReferenceOptions): Promise<{ role: Role; reference: string }[]> {
  const counts = await readReferenceCounts(options);
  return counts.filter((item) => item.count === 0).map((item) => ({ role: item.role, reference: item.reference }));
}

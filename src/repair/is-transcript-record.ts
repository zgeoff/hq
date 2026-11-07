import { isRecord } from '@zgeoff/std';
import type { Rec } from './types.ts';

// A guard in place of a schema parse: a parse rebuilds the object with its known keys first, and
// the repair must write every other line back with its keys in the order Claude wrote them.
export function isTranscriptRecord(value: unknown): value is Rec['obj'] {
  if (!isRecord(value)) {
    return false;
  }
  const message = value['message'];
  return (
    typeof value['uuid'] === 'string' &&
    isOptional(value['parentUuid'], 'string', true) &&
    isOptional(value['type'], 'string', false) &&
    isOptional(value['isSidechain'], 'boolean', false) &&
    (message === undefined || (isRecord(message) && isOptional(message['id'], 'string', false)))
  );
}

function isOptional(field: unknown, type: 'string' | 'boolean', allowNull: boolean): boolean {
  return field === undefined || (allowNull && field === null) || typeof field === type;
}

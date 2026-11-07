import { isRecord } from '@zgeoff/std';
import type { Rec } from './types.ts';

// A guard in place of a schema parse: a parse rebuilds the object with its known keys first, and
// the repair must write every other line back with its keys in the order Claude wrote them.
export function isTranscriptRecord(value: unknown): value is Rec['obj'] {
  if (!isRecord(value)) {
    return false;
  }
  const { uuid, parentUuid, type, isSidechain, message } = value;
  return (
    typeof uuid === 'string' &&
    (parentUuid === undefined || parentUuid === null || typeof parentUuid === 'string') &&
    (type === undefined || typeof type === 'string') &&
    (isSidechain === undefined || typeof isSidechain === 'boolean') &&
    (message === undefined || (isRecord(message) && (message['id'] === undefined || typeof message['id'] === 'string')))
  );
}

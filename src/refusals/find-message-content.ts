import { isRecord } from '@zgeoff/std';
import type { Obj } from './types.ts';

export function findMessageContent(record: Obj | null): unknown {
  const message = record?.['message'];
  return isRecord(message) ? message['content'] : undefined;
}

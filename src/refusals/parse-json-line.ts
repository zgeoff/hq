import { isRecord } from '@zgeoff/std';
import { parseJSON } from '../noslop/parse-json.ts';
import type { Obj } from './types.ts';

export function parseJSONLine(line: string): Obj | null {
  const parsed = parseJSON(line);
  return isRecord(parsed) ? parsed : null;
}

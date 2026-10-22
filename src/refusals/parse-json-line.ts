import type { Obj } from './types.ts';

export function parseJSONLine(line: string): Obj | null {
  try {
    const o: unknown = JSON.parse(line);
    return o && typeof o === 'object' ? (o as Obj) : null;
  } catch {
    return null; // a partial first line, or damage: skipped
  }
}

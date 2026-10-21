import { HqError } from '../errors.ts';
import type { Rec } from './types.ts';

export function parseTranscript(text: string): { lines: string[]; recs: Rec[] } {
  const lines = text.split('\n');
  const recs: Rec[] = [];
  lines.forEach((l, i) => {
    if (!l.trim()) return;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(l) as Record<string, unknown>;
    } catch {
      throw new HqError('bad_transcript', `line ${i + 1} is not JSON; hq repairs only a transcript whose every line parses`);
    }
    if (typeof obj['uuid'] === 'string') {
      recs.push({ line: i, obj: obj as Rec['obj'] });
    }
  });
  return { lines, recs };
}

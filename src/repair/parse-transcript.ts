import { isRecord } from '@zgeoff/std';
import { HqError } from '../errors.ts';
import { isTranscriptRecord } from './is-transcript-record.ts';
import type { Rec } from './types.ts';

export function parseTranscript(text: string): { lines: string[]; recs: Rec[] } {
  const lines = text.split('\n');
  const recs: Rec[] = [];
  lines.forEach((l, i) => {
    if (!l.trim()) return;
    let obj: unknown;
    try {
      obj = JSON.parse(l);
    } catch {
      throw new HqError('bad_transcript', `line ${i + 1} is not JSON; hq repairs only a transcript whose every line parses`);
    }
    if (!isRecord(obj) || typeof obj['uuid'] !== 'string') {
      return;
    }
    if (!isTranscriptRecord(obj)) {
      throw new HqError('bad_transcript', `line ${i + 1} has a uuid but its parentUuid, type, isSidechain or message.id has an unexpected type`);
    }
    recs.push({ line: i, obj });
  });
  return { lines, recs };
}

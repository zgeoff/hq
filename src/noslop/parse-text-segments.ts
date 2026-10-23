import type { Segment } from './segment.ts';

const VERSION_IN_TEXT = /(?<![\w./-])(?:v\d+\.\d+(?:\.\d+)?|\d+\.\d+\.\d+)(?:-(?:alpha|beta|rc)(?:\.\d+)*)?(?![\w-]|\.\d)/gu;

// Text only, with its version tokens set apart.
export function parseTextSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(VERSION_IN_TEXT)) {
    pushText(segments, text.slice(last, match.index));
    segments.push({ kind: 'version', value: match[0] });
    last = match.index + match[0].length;
  }
  pushText(segments, text.slice(last));
  return segments;
}

function pushText(segments: Segment[], value: string): void {
  if (value !== '') {
    segments.push({ kind: 'text', value });
  }
}

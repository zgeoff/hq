import type { Segment } from './segment.ts';
import { parseTextSegments } from './parse-text-segments.ts';

const REFERENCE_DEFINITION = /^(?<lead>\s{0,3}\[[^\]]+\]:\s*)(?<destination>\S+)/u;

// A Markdown line as text, version tokens, whole code spans and link destinations (inline or a
// reference definition's), in order.
export function parseLineSegments(line: string): Segment[] {
  const reference = REFERENCE_DEFINITION.exec(line);
  if (reference === null) {
    return parseInline(line);
  }
  const lead = reference.groups?.['lead'] ?? '';
  const destination = reference.groups?.['destination'] ?? '';
  return [{ kind: 'text', value: lead }, { kind: 'dest', value: destination }, ...parseInline(line.slice(lead.length + destination.length))];
}

const INLINE = /`[^`\n]+`|\]\((?<destination>[^)\s]*)(?:\s+"[^"]*")?\)/gu;

function parseInline(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match[0].startsWith('`')) {
      segments.push(...parseTextSegments(text.slice(last, match.index)), { kind: 'code', value: match[0] });
      last = match.index + match[0].length;
      continue;
    }
    const destination = match.groups?.['destination'] ?? '';
    const start = match.index + 2;
    segments.push(...parseTextSegments(text.slice(last, start)), { kind: 'dest', value: destination });
    last = start + destination.length;
  }
  segments.push(...parseTextSegments(text.slice(last)));
  return segments;
}

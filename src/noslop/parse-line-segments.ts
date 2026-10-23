export interface Segment {
  kind: 'text' | 'version' | 'code' | 'dest';
  value: string;
}

export const VERSION = /^v?\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z.]+)?$/u;

const REFERENCE_DEFINITION = /^(?<lead>\s{0,3}\[[^\]]+\]:\s*)(?<destination>\S+)/u;
const VERSION_IN_TEXT = /(?<![\w./-])v?\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z.]*[0-9A-Za-z])?(?![\w-]|\.\d)/gu;

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

function pushText(segments: Segment[], value: string): void {
  if (value !== '') {
    segments.push({ kind: 'text', value });
  }
}

const FENCE_LINE = /^ {0,3}(?<run>`{3,}|~{3,})(?<info>.*)$/u;

export interface FenceLine {
  marker: '`' | '~';
  length: number;
  info: string;
}

// A code fence line as CommonMark reads one: up to three spaces, a run of three or more backticks
// or tildes, then the info string. A backtick run whose info string holds a backtick is no fence.
export function parseFenceLine(line: string): FenceLine | null {
  const groups = FENCE_LINE.exec(line)?.groups;
  const run = groups?.['run'];
  if (run === undefined) {
    return null;
  }
  const info = (groups?.['info'] ?? '').trim();
  const marker = run.startsWith('`') ? '`' : '~';
  if (marker === '`' && info.includes('`')) {
    return null;
  }
  return { marker, length: run.length, info };
}

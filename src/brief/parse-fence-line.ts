const FENCE_LINE = /^ {0,3}(?<run>`{3,}|~{3,})(?<info>.*)$/u;

export interface FenceLine {
  marker: '`' | '~';
  length: number;
  info: string;
}

// As CommonMark reads one, a backtick run whose info string holds a backtick is no fence.
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

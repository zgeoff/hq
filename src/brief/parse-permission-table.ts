import { collectFencedLines } from './collect-fenced-lines.ts';
import type { PermissionRow } from './types.ts';

const SEPARATOR = /^:?-+:?$/u;

export function parsePermissionTable(markdown: string): PermissionRow[] {
  const lines = collectUnfencedLines(markdown.split('\n'));
  const start = lines.findIndex((line) => isPermissionHeading(line.trim().toLowerCase()));
  if (start === -1) {
    return [];
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,2} /u.test(line));
  const rows: PermissionRow[] = [];
  for (const line of end === -1 ? rest : rest.slice(0, end)) {
    const cells = splitRow(line.trim());
    const action = cells[0]?.trim() ?? '';
    if (cells.length >= 2 && action !== '' && action.toLowerCase() !== 'action' && !SEPARATOR.test(action)) {
      rows.push({ action, phrase: cells.slice(1).join('|').trim() });
    }
  }
  return rows;
}

function collectUnfencedLines(lines: readonly string[]): string[] {
  const fenced = collectFencedLines(lines);
  return lines.filter((_, index) => fenced[index] !== true);
}

// The private half names the section after the public placeholder it fills, and ends the heading
// with "(the permission phrasing)" however that name reads; older clones keep the short name.
const SHORT_HEADING = '## permission phrasing';
const HEADING = /^## .*\bthe permission phrasing\)$/u;

function isPermissionHeading(heading: string): boolean {
  return heading === SHORT_HEADING || HEADING.test(heading);
}

function splitRow(row: string): string[] {
  if (!row.startsWith('|')) {
    return [];
  }
  const inner = row.endsWith('|') ? row.slice(1, -1) : row.slice(1);
  return inner.split('|');
}

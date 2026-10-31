import { collectFencedLines } from './collect-fenced-lines.ts';
import type { PermissionRow } from './types.ts';

// The private half names the section after the public placeholder it fills; older clones keep the
// short name.
const HEADINGS = new Set(['## permission phrasing', '## placeholders (`{{permissions}}`: the permission phrasing)']);
const SEPARATOR = /^:?-+:?$/u;

// The `| Action | Phrase in the brief |` rows under the permission phrasing heading, and no
// other part of the text: the section ends at the next heading of its level or a higher one. A
// heading or a row inside a code fence is text.
export function parsePermissionTable(markdown: string): PermissionRow[] {
  const lines = collectUnfencedLines(markdown.split('\n'));
  const start = lines.findIndex((line) => HEADINGS.has(line.trim().toLowerCase()));
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

function splitRow(row: string): string[] {
  if (!row.startsWith('|')) {
    return [];
  }
  const inner = row.endsWith('|') ? row.slice(1, -1) : row.slice(1);
  return inner.split('|');
}

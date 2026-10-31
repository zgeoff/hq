import type { PermissionRow } from './types.ts';

const HEADING = '## permission phrasing';
const SEPARATOR = /^:?-+:?$/u;

// The `| Action | Phrase in the brief |` rows under the `## permission phrasing` heading, and no
// other part of the text: the section ends at the next heading of its level or a higher one.
export function parsePermissionTable(markdown: string): PermissionRow[] {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim().toLowerCase() === HEADING);
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

function splitRow(row: string): string[] {
  if (!row.startsWith('|')) {
    return [];
  }
  const inner = row.endsWith('|') ? row.slice(1, -1) : row.slice(1);
  return inner.split('|');
}

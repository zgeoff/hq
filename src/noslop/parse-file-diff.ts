interface DiffHunk {
  // The head line of the first added line.
  start: number;
  removed: string[];
  added: string[];
}

export type FileDiff = { refused: string } | { hunks: DiffHunk[] };

const HEADER_REFUSALS: [prefix: string, reason: string][] = [
  ['new file mode', 'the file is new'],
  ['deleted file mode', 'the file is deleted'],
  ['old mode', 'the file mode changed'],
  ['new mode', 'the file mode changed'],
  ['rename ', 'the file is renamed'],
  ['copy ', 'the file is a copy'],
  ['Binary files', 'the file is binary'],
  ['GIT binary patch', 'the file is binary'],
];

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(?<start>\d+)(?:,\d+)? @@/u;

// A single file's `git diff --unified=0` text as hunks of removed and added lines, or the reason it
// cannot be read as text edits.
export function parseFileDiff(diff: string): FileDiff {
  const hunks: DiffHunk[] = [];
  let open: DiffHunk | null = null;
  for (const line of diff.split('\n')) {
    const header = HUNK_HEADER.exec(line);
    if (header !== null) {
      open = { start: Number(header.groups?.['start']), removed: [], added: [] };
      hunks.push(open);
      continue;
    }
    if (open === null) {
      const refusal = HEADER_REFUSALS.find(([prefix]) => line.startsWith(prefix));
      if (refusal !== undefined) {
        return { refused: refusal[1] };
      }
      continue;
    }
    if (line.startsWith('\\')) {
      return { refused: 'a line ending at the end of the file changed' };
    }
    if (line.startsWith('-')) {
      open.removed.push(line.slice(1));
    } else if (line.startsWith('+')) {
      open.added.push(line.slice(1));
    }
  }
  return { hunks };
}

// Lints only the lines a branch changes against its base: hq takes the shared rules unchanged, and
// its older code comes into line as it is touched. A new file is linted whole, except for code the
// branch only moved: a run of 3 or more added lines, each matching a line the branch deletes. A
// branch onto a base with no package.json imports the tree into an empty repo, and lints nothing.
import { spawnSync } from 'node:child_process';
import { probeImportBase } from './probe-import-base.ts';
import { readDiff } from './read-diff.ts';

interface Diagnostic {
  readonly code: string;
  readonly filename: string;
  readonly labels: readonly { readonly span: { readonly line: number } }[];
  readonly message: string;
}

interface ChangeSet {
  readonly lines: ReadonlyMap<string, ReadonlySet<number>>;
  readonly moved: ReadonlyMap<string, ReadonlySet<number>>;
  readonly whole: ReadonlySet<string>;
}

const FILE = /^\+\+\+ b\/(?<path>.+)$/u,
  HUNK = /^@@ -\d+(?:,\d+)? \+(?<start>\d+)(?:,(?<count>\d+))? @@/u,
  MOVED_RUN = 3;

interface AddedRow {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

interface ParseState {
  added: boolean;
  current: string;
  next: number;
  readonly lines: Map<string, Set<number>>;
  readonly whole: Set<string>;
  readonly addedRows: AddedRow[];
  readonly removed: Map<string, number>;
}


function recordHunk(state: ParseState, groups: Readonly<Record<string, string | undefined>>): void {
  const end = Number(groups['start']) + Number(groups['count'] ?? '1'),
    set = state.lines.get(state.current) ?? new Set<number>();
  state.next = Number(groups['start']);
  for (let line = Number(groups['start']); line < end; line += 1) {
    set.add(line);
  }
  state.lines.set(state.current, set);
}

function recordRow(state: ParseState, row: string): void {
  if (row.startsWith('--- ')) {
    state.added = row === '--- /dev/null';
    return;
  }
  if (recordContent(state, row)) {
    return;
  }
  const file = FILE.exec(row)?.groups?.['path'],
    hunk = HUNK.exec(row)?.groups;
  if (row === '+++ /dev/null') {
    state.current = '';
    return;
  }
  if (file !== undefined) {
    state.current = file;
    if (state.added) {
      state.whole.add(file);
    }
    return;
  }
  if (hunk !== undefined && state.current !== '') {
    recordHunk(state, hunk);
  }
}

// A content row of a hunk: an added line keeps its new-file number, a deleted line only its text. A
// deleted file has no new name, so its rows only give deleted lines.
function recordContent(state: ParseState, row: string): boolean {
  if (row.startsWith('+') && !row.startsWith('+++ ') && state.current !== '') {
    state.addedRows.push({ file: state.current, line: state.next, text: row.slice(1).trim() });
    state.next += 1;
    return true;
  }
  if (row.startsWith('-') && !row.startsWith('--- ')) {
    const text = row.slice(1).trim();
    state.removed.set(text, (state.removed.get(text) ?? 0) + 1);
    return true;
  }
  return false;
}

export function parseChanges(diff: string): ChangeSet {
  const state: ParseState = { added: false, current: '', next: 0, lines: new Map(), whole: new Set(), addedRows: [], removed: new Map() };
  for (const row of diff.split('\n')) {
    recordRow(state, row);
  }
  return { lines: state.lines, moved: findMovedLines(state.addedRows, state.removed), whole: state.whole };
}

export function isChanged(diagnostic: Diagnostic, changes: ChangeSet): boolean {
  const moved = changes.moved.get(diagnostic.filename),
    set = changes.lines.get(diagnostic.filename),
    whole = changes.whole.has(diagnostic.filename);
  return diagnostic.labels.some((label) => moved?.has(label.span.line) !== true && (whole || set?.has(label.span.line) === true));
}

// Each deleted line vouches for one added line with the same text. Only a run of MOVED_RUN or more
// vouched lines in a row counts as moved, so a lone `return null;` that happens to match stays linted.
function findMovedLines(rows: readonly AddedRow[], removed: ReadonlyMap<string, number>): Map<string, Set<number>> {
  const left = new Map(removed),
    moved = new Map<string, Set<number>>();
  let run: AddedRow[] = [];
  for (const row of rows) {
    if (isRunBroken(run.at(-1), row, left)) {
      recordRun(moved, left, run);
      run = [];
    }
    const count = left.get(row.text) ?? 0;
    if (count > 0) {
      left.set(row.text, count - 1);
      run.push(row);
    }
  }
  recordRun(moved, left, run);
  return moved;
}

function isRunBroken(previous: AddedRow | undefined, row: AddedRow, left: ReadonlyMap<string, number>): boolean {
  return previous !== undefined && (previous.file !== row.file || previous.line + 1 !== row.line || (left.get(row.text) ?? 0) === 0);
}

// A run too short to count gives its deleted lines back, so a real move later in the diff can use them.
function recordRun(moved: Map<string, Set<number>>, left: Map<string, number>, run: readonly AddedRow[]): void {
  if (run.length < MOVED_RUN) {
    for (const row of run) {
      left.set(row.text, (left.get(row.text) ?? 0) + 1);
    }
    return;
  }
  for (const row of run) {
    const set = moved.get(row.file) ?? new Set<number>();
    set.add(row.line);
    moved.set(row.file, set);
  }
}

function runCommand(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.error !== undefined) {
    throw result.error;
  }
  return result.stdout;
}

function readDiagnostics(files: readonly string[]): readonly Diagnostic[] {
  const report = JSON.parse(runCommand('bunx', ['oxlint', '--format', 'json', ...files])) as { readonly diagnostics: readonly Diagnostic[] };
  return report.diagnostics;
}

function printFound(found: readonly Diagnostic[], files: readonly string[], base: string): number {
  for (const diagnostic of found) {
    console.log(`${diagnostic.filename}:${diagnostic.labels[0]?.span.line ?? 0} ${diagnostic.code} ${diagnostic.message}`);
  }
  console.log(`lint:changed: ${found.length} problem(s) on changed lines in ${files.length} file(s) against ${base}`);
  if (found.length === 0) {
    return 0;
  }
  return 1;
}

function runMain(base: string): number {
  if (probeImportBase(base)) {
    console.log(`lint:changed: the merge base with ${base} holds no package.json, so this branch imports the tree and changes no linted line`);
    return 0;
  }
  const changes = parseChanges(readDiff(base)),
    files = [...new Set([...changes.lines.keys(), ...changes.whole])];
  if (files.length === 0) {
    console.log(`lint:changed: no TypeScript changes against ${base}`);
    return 0;
  }
  return printFound(
    readDiagnostics(files).filter((diagnostic) => isChanged(diagnostic, changes)),
    files,
    base,
  );
}

if (import.meta.main) {
  process.exit(runMain(process.env['LINT_BASE'] ?? 'origin/main'));
}

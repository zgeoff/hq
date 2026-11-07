import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import { probeImportBase } from './probe-import-base.ts';
import { readDiff } from './read-diff.ts';

const labelSchema = z.object({ span: z.object({ line: z.number() }) });
const diagnosticSchema = z.object({ code: z.string(), filename: z.string(), labels: z.array(labelSchema), message: z.string() });
const reportSchema = z.object({ diagnostics: z.array(diagnosticSchema) });

type Diagnostic = z.infer<typeof diagnosticSchema>;

interface ChangeSet {
  readonly lines: ReadonlyMap<string, ReadonlySet<number>>;
  readonly moved: ReadonlyMap<string, ReadonlySet<number>>;
  readonly whole: ReadonlySet<string>;
}

const FILE = /^\+\+\+ b\/(?<path>.+)$/u;
const HUNK = /^@@ -\d+(?:,\d+)? \+(?<start>\d+)(?:,(?<count>\d+))? @@/u;
const MOVED_RUN = 3;

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
  const end = Number(groups['start']) + Number(groups['count'] ?? '1');
  const set = state.lines.get(state.current) ?? new Set<number>();
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
  const file = FILE.exec(row)?.groups?.['path'];
  const hunk = HUNK.exec(row)?.groups;
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
  const moved = changes.moved.get(diagnostic.filename);
  const set = changes.lines.get(diagnostic.filename);
  const whole = changes.whole.has(diagnostic.filename);
  return diagnostic.labels.some((label) => moved?.has(label.span.line) !== true && (whole || set?.has(label.span.line) === true));
}

function findMovedLines(rows: readonly AddedRow[], removed: ReadonlyMap<string, number>): Map<string, Set<number>> {
  const left = new Map(removed);
  const moved = new Map<string, Set<number>>();
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

const UNSAFE_RULES = ['assignment', 'argument', 'return', 'member-access', 'call'] as const;

// The type-aware run turns every other rule off, so the plain run keeps reporting those.
export function buildLintArgs(files: readonly string[], typeAware: boolean): string[] {
  const base = ['oxlint', '--format', 'json'];
  if (!typeAware) {
    return [...base, ...files];
  }
  return [...base, '--type-aware', '-A', 'all', ...UNSAFE_RULES.flatMap((rule) => ['-D', `typescript/no-unsafe-${rule}`]), ...files];
}

function readDiagnostics(files: readonly string[]): readonly Diagnostic[] {
  return [false, true].flatMap((typeAware) => readReport(buildLintArgs(files, typeAware)));
}

function readReport(args: readonly string[]): readonly Diagnostic[] {
  const output: unknown = JSON.parse(runCommand('bunx', args));
  return reportSchema.parse(output).diagnostics;
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
  const changes = parseChanges(readDiff(base));
  const files = [...new Set([...changes.lines.keys(), ...changes.whole])];
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

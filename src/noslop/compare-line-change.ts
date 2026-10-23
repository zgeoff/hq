import { match } from 'ts-pattern';
import { buildMoveCandidates } from './build-move-candidates.ts';
import type { TargetMode } from './build-move-candidates.ts';
import { parseLineSegments } from './parse-line-segments.ts';
import { parseTextSegments } from './parse-text-segments.ts';
import type { Segment } from './segment.ts';
import { VERSION } from './version-pattern.ts';

type Candidates = [string, string][];

export type LineChange = { ok: true; moves: Candidates[] } | { ok: false; reason: string };

const TABLE_ROW = /^\s*\|.*\|\s*$/u;

// Whether one removed line and the added line that replaces it differ only by a moved link or path
// target, a version number or table padding. A target that moved comes back as a claim for the
// caller to prove; every other difference refuses.
export function compareLineChange(file: string, oldLine: string, newLine: string): LineChange {
  if (TABLE_ROW.test(oldLine) && TABLE_ROW.test(newLine)) {
    return compareTableRows(file, oldLine, newLine);
  }
  return compareSegments(file, parseLineSegments(oldLine), parseLineSegments(newLine));
}

function compareTableRows(file: string, oldLine: string, newLine: string): LineChange {
  if (leadingSpace(oldLine) !== leadingSpace(newLine)) {
    return refuse('a table row was indented differently');
  }
  const oldCells = splitCells(oldLine);
  const newCells = splitCells(newLine);
  if (oldCells.length !== newCells.length) {
    return refuse('a table row has a different number of cells');
  }
  const moves: Candidates[] = [];
  for (const [index, oldCell] of oldCells.entries()) {
    const newCell = newCells[index] ?? '';
    if (oldCell === newCell || isSameDelimiter(oldCell, newCell)) {
      continue;
    }
    const change = compareSegments(file, parseLineSegments(oldCell), parseLineSegments(newCell));
    if (!change.ok) {
      return refuse('a table cell changed');
    }
    moves.push(...change.moves);
  }
  return { ok: true, moves };
}

function leadingSpace(line: string): string {
  return /^\s*/u.exec(line)?.[0] ?? '';
}

function refuse(reason: string): LineChange {
  return { ok: false, reason };
}

function splitCells(line: string): string[] {
  return line
    .trim()
    .slice(1, -1)
    .split(/(?<!\\)\|/u)
    .map((cell) => cell.trim());
}

const DELIMITER_CELL = /^(?<start>:?)-+(?<end>:?)$/u;

function isSameDelimiter(oldCell: string, newCell: string): boolean {
  const oldMatch = DELIMITER_CELL.exec(oldCell);
  const newMatch = DELIMITER_CELL.exec(newCell);
  return oldMatch !== null && newMatch !== null && oldMatch.groups?.['start'] === newMatch.groups?.['start'] && oldMatch.groups?.['end'] === newMatch.groups?.['end'];
}

function compareSegments(file: string, oldSegments: Segment[], newSegments: Segment[]): LineChange {
  if (oldSegments.length !== newSegments.length) {
    return refuse('the words of the line changed');
  }
  const moves: Candidates[] = [];
  for (const [index, oldSegment] of oldSegments.entries()) {
    const newSegment = newSegments[index];
    if (newSegment === undefined || newSegment.kind !== oldSegment.kind) {
      return refuse('the words of the line changed');
    }
    if (newSegment.value === oldSegment.value) {
      continue;
    }
    const change = compareSegment(file, oldSegment, newSegment);
    if (!change.ok) {
      return change;
    }
    moves.push(...change.moves);
  }
  return { ok: true, moves };
}

function compareSegment(file: string, oldSegment: Segment, newSegment: Segment): LineChange {
  return match(oldSegment.kind)
    .with('version', (): LineChange => ({ ok: true, moves: [] }))
    .with('dest', () => compareDestination(file, oldSegment.value, newSegment.value))
    .with('code', () => compareCode(file, oldSegment.value.slice(1, -1), newSegment.value.slice(1, -1)))
    .with('text', () => refuse('the words of the line changed'))
    .exhaustive();
}

function compareDestination(file: string, from: string, to: string): LineChange {
  const [fromPath = '', fromAnchor = ''] = from.split('#', 2);
  const [toPath = '', toAnchor = ''] = to.split('#', 2);
  if (fromAnchor !== toAnchor || from.split('#').length !== to.split('#').length || fromPath === toPath) {
    return refuse('a link anchor changed');
  }
  if (!isRepoPath(fromPath) || !isRepoPath(toPath) || fromPath.startsWith('/') !== toPath.startsWith('/')) {
    return refuse('a link target changed that is not a path in the repo');
  }
  return buildMove(file, fromPath, toPath, ['file']);
}

const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/u;

function isRepoPath(target: string): boolean {
  return target !== '' && !SCHEME.test(target) && !target.startsWith('//') && !/[?<>*\s]/u.test(target);
}

function buildMove(file: string, from: string, to: string, modes: TargetMode[]): LineChange {
  const candidates = buildMoveCandidates(file, from, to, modes);
  return candidates === null ? refuse('a target points outside the repo') : { ok: true, moves: [candidates] };
}

function compareCode(file: string, from: string, to: string): LineChange {
  if (VERSION.test(from) && VERSION.test(to)) {
    return { ok: true, moves: [] };
  }
  if (isPathShaped(from) && isPathShaped(to)) {
    return buildMove(file, from, to, ['file', 'root']);
  }
  const oldSegments = parseTextSegments(from);
  const newSegments = parseTextSegments(to);
  const sameShape = oldSegments.length === newSegments.length && oldSegments.every((segment, index) => segment.kind === newSegments[index]?.kind && (segment.kind === 'version' || segment.value === newSegments[index]?.value));
  return sameShape ? { ok: true, moves: [] } : refuse('code in a code span changed');
}

const EXTENSION = /\.[A-Za-z][A-Za-z0-9]*$/u;

function isPathShaped(text: string): boolean {
  return isRepoPath(text) && (text.includes('/') || EXTENSION.test(text));
}

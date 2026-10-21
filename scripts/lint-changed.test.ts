import { describe, expect, test } from 'bun:test';
import { isChanged, parseChanges } from './lint-changed.ts';

const DIFF = [
  'diff --git a/src/kettle.ts b/src/kettle.ts',
  '--- a/src/kettle.ts',
  '+++ b/src/kettle.ts',
  '@@ -10,2 +10,3 @@ export function boil',
  '+  const water = 1;',
  '@@ -40 +41 @@',
  '+  return water;',
  '@@ -50,3 +52,0 @@',
  'diff --git a/src/teapot.ts b/src/teapot.ts',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/src/teapot.ts',
  '@@ -0,0 +1,2 @@',
  '+export const spout = 1;',
].join('\n'),
  MOVE_DIFF = [
  'diff --git a/src/kettle.ts b/src/kettle.ts',
  '--- a/src/kettle.ts',
  '+++ b/src/kettle.ts',
  '@@ -20,5 +19,0 @@',
  '-function boilWater(litres) {',
  '-  const minutes = litres * 3;',
  '-  return minutes;',
  '-}',
  '-const spoutAngle = 40;',
  '@@ -60,3 +55,0 @@',
  '-export function pourTea(cups) {',
  '-  if (cups > 4) return null;',
  '-  return cups * 250;',
  'diff --git a/src/kettle/boil-water.ts b/src/kettle/boil-water.ts',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/src/kettle/boil-water.ts',
  '@@ -0,0 +1,6 @@',
  '+// Boils the water.',
  '+function boilWater(litres) {',
  '+  const minutes = litres * 3;',
  '+  return minutes;',
  '+}',
  '+const spoutAngle = 45;',
  'diff --git a/src/teapot.ts b/src/teapot.ts',
  '--- a/src/teapot.ts',
  '+++ b/src/teapot.ts',
  '@@ -8,0 +9,4 @@',
  '+export function pourTea(cups) {',
  '+  if (cups > 6) return null;',
  '+  return cups * 250;',
  '+}',
].join('\n');

function buildDiagnostic(filename: string, line: number): Parameters<typeof isChanged>[0] {
  return { code: 'eslint(curly)', filename, labels: [{ span: { line } }], message: 'Expected braces' };
}

describe('parseChanges', () => {
  test('reads the added lines of each hunk, and a zero-count hunk adds none', () => {
    const changes = parseChanges(DIFF);
    expect([...(changes.lines.get('src/kettle.ts') ?? [])]).toEqual([10, 11, 12, 41]);
  });

  test('marks a new file as changed whole', () => {
    expect([...parseChanges(DIFF).whole]).toEqual(['src/teapot.ts']);
  });

  test('an empty diff has no changes', () => {
    const changes = parseChanges('');
    expect(changes.lines.size + changes.whole.size).toBe(0);
  });
});

describe('isChanged', () => {
  const changes = parseChanges(DIFF);

  test('keeps a problem on a changed line', () => {
    expect(isChanged(buildDiagnostic('src/kettle.ts', 41), changes)).toBe(true);
  });

  test('drops a problem on an unchanged line of a touched file', () => {
    expect(isChanged(buildDiagnostic('src/kettle.ts', 30), changes)).toBe(false);
  });

  test('keeps every problem in a new file', () => {
    expect(isChanged(buildDiagnostic('src/teapot.ts', 900), changes)).toBe(true);
  });

  test('drops a problem in an untouched file', () => {
    expect(isChanged(buildDiagnostic('src/mug.ts', 1), changes)).toBe(false);
  });
});


describe('moved lines', () => {
  const changes = parseChanges(MOVE_DIFF);

  test('a block moved into a new file is not linted, though the file is new', () => {
    for (const line of [2, 3, 4, 5]) {
      expect(isChanged(buildDiagnostic('src/kettle/boil-water.ts', line), changes)).toBe(false);
    }
  });

  test('a line added beside the moved block, and a moved line that was edited, are still linted', () => {
    expect(isChanged(buildDiagnostic('src/kettle/boil-water.ts', 1), changes)).toBe(true);
    expect(isChanged(buildDiagnostic('src/kettle/boil-water.ts', 6), changes)).toBe(true);
  });

  test('an edit inside a block moved between existing files breaks the run, so short runs are linted', () => {
    expect([9, 10, 11, 12].map((line) => isChanged(buildDiagnostic('src/teapot.ts', line), changes))).toStrictEqual([true, true, true, true]);
  });

  test('a block moved between existing files, unedited, is not linted', () => {
    const moved = parseChanges(MOVE_DIFF.replace("'+  if (cups > 6) return null;'", '').replace('+  if (cups > 6) return null;', '+  if (cups > 4) return null;'));

    expect([9, 10, 11].map((line) => isChanged(buildDiagnostic('src/teapot.ts', line), moved))).toStrictEqual([false, false, false]);
    expect(isChanged(buildDiagnostic('src/teapot.ts', 12), moved)).toBe(true);
  });

  test('fewer than 3 matching lines in a row are linted, so a common line is not skipped by chance', () => {
    const short = parseChanges(['--- a/src/mug.ts', '+++ b/src/mug.ts', '@@ -5,2 +5,0 @@', '-  return null;', '-}', '--- a/src/cup.ts', '+++ b/src/cup.ts', '@@ -3,0 +4,2 @@', '+  return null;', '+}'].join('\n'));

    expect([4, 5].map((line) => isChanged(buildDiagnostic('src/cup.ts', line), short))).toStrictEqual([true, true]);
  });

  test('a whole file deleted and split into new files counts as moved', () => {
    const split = parseChanges(
      [
        'diff --git a/src/kettle.ts b/src/kettle.ts',
        'deleted file mode 100644',
        '--- a/src/kettle.ts',
        '+++ /dev/null',
        '@@ -1,3 +0,0 @@',
        '-export function boilWater(litres) {',
        '-  return litres * 3;',
        '-}',
        'diff --git a/src/kettle/boil-water.ts b/src/kettle/boil-water.ts',
        'new file mode 100644',
        '--- /dev/null',
        '+++ b/src/kettle/boil-water.ts',
        '@@ -0,0 +1,3 @@',
        '+export function boilWater(litres) {',
        '+  return litres * 3;',
        '+}',
      ].join('\n'),
    );

    expect([1, 2, 3].map((line) => isChanged(buildDiagnostic('src/kettle/boil-water.ts', line), split))).toStrictEqual([false, false, false]);
    expect([...split.lines.keys()]).toStrictEqual(['src/kettle/boil-water.ts']);
  });

  test('a short run gives its deleted lines back, so a later real move still counts', () => {
    const later = parseChanges(
      [
        '--- a/src/kettle.ts',
        '+++ b/src/kettle.ts',
        '@@ -1,3 +0,0 @@',
        '-  const cups = 2;',
        '-  return cups;',
        '-}',
        '--- a/src/cup.ts',
        '+++ b/src/cup.ts',
        '@@ -3,0 +4,2 @@',
        '+  return cups;',
        '+}',
        '--- a/src/teapot.ts',
        '+++ b/src/teapot.ts',
        '@@ -8,0 +9,3 @@',
        '+  const cups = 2;',
        '+  return cups;',
        '+}',
      ].join('\n'),
    );

    expect([4, 5].map((line) => isChanged(buildDiagnostic('src/cup.ts', line), later))).toStrictEqual([true, true]);
    expect([9, 10, 11].map((line) => isChanged(buildDiagnostic('src/teapot.ts', line), later))).toStrictEqual([false, false, false]);
  });

  test('a chance match that gives its lines back right before a real move leaves that move whole', () => {
    const refund = parseChanges(
      [
        '--- a/src/kettle.ts',
        '+++ b/src/kettle.ts',
        '@@ -1,3 +0,0 @@',
        '-  const cups = 2;',
        '-  return cups;',
        '-}',
        '--- a/src/teapot.ts',
        '+++ b/src/teapot.ts',
        '@@ -8,0 +9,4 @@',
        '+  const cups = 2;',
        '+  const cups = 2;',
        '+  return cups;',
        '+}',
      ].join('\n'),
    );

    expect(isChanged(buildDiagnostic('src/teapot.ts', 9), refund)).toBe(true);
    expect([10, 11, 12].map((line) => isChanged(buildDiagnostic('src/teapot.ts', line), refund))).toStrictEqual([false, false, false]);
  });
});

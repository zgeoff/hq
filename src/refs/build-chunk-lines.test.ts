import { expect, test } from 'bun:test';
import { buildChunkLines } from './build-chunk-lines.ts';

// `decode` runs one chunk against a carry of `parts` and gives back strings to compare.
function setupTest() {
  return {
    decode: (parts: string[], chunk: string, maxLine: number, skipping = false) => {
      const carry = { parts: parts.map((part) => Buffer.from(part)), length: parts.join('').length, skipping };
      const result = buildChunkLines(carry, Buffer.from(chunk), maxLine);
      return { lines: result.lines.map(String), parts: result.carry.parts.map(String), length: result.carry.length, skipping: result.carry.skipping };
    },
  };
}

test('the carried line completes and the chunk tail carries; whole lines with no references path are dropped', () => {
  const ctx = setupTest();

  expect(ctx.decode(['{"kett'], 'le":1}\n{"widgets":2}\n{"tea', 64)).toStrictEqual({ lines: ['{"kettle":1}'], parts: ['{"tea'], length: 5, skipping: false });
});

test('whole lines of a chunk that holds a references path all come out', () => {
  const ctx = setupTest();

  expect(ctx.decode([], 'a\n/s/references/kettle.md\nwidgets\nspout', 64)).toStrictEqual({ lines: ['a', '/s/references/kettle.md', 'widgets'], parts: ['spout'], length: 5, skipping: false });
});

test('a chunk with no newline grows the carry while it stays within maxLine', () => {
  const ctx = setupTest();

  expect(ctx.decode(['kettle'], 'widgets', 16)).toStrictEqual({ lines: [], parts: ['kettle', 'widgets'], length: 13, skipping: false });
});

test('a carry that grows past maxLine is dropped and its line skipped', () => {
  const ctx = setupTest();

  expect(ctx.decode(['kettle'], 'widgets-teapot', 16)).toStrictEqual({ lines: [], parts: [], length: 0, skipping: true });
});

test('a skipped line does not come out when its newline arrives', () => {
  const ctx = setupTest();

  expect(ctx.decode([], 'kettle\nspout', 64, true)).toStrictEqual({ lines: [], parts: ['spout'], length: 5, skipping: false });
});

test('a first line that ends past maxLine does not come out', () => {
  const ctx = setupTest();

  expect(ctx.decode(['kettle'], 'widgets-teapot\nspout', 16)).toStrictEqual({ lines: [], parts: ['spout'], length: 5, skipping: false });
});

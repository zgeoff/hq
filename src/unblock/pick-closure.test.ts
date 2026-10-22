import { expect, test } from 'bun:test';
import { pickClosure } from './pick-closure.ts';

test('it closes as done on the first settled condition', () => {
  const closure = pickClosure(
    [
      { condition: { kind: 'issue', ref: 'KET-7' }, verdict: { kind: 'waiting' } },
      { condition: { kind: 'pr', ref: 'kettle-co/kettle#4' }, verdict: { kind: 'settled', what: 'merged' } },
      { condition: { kind: 'doc', ref: 'abc123def456' }, verdict: { kind: 'settled', what: 'decided' } },
    ],
    null,
  );

  expect(closure).toStrictEqual({ to: 'done', note: 'settled: pr:kettle-co/kettle#4 merged' });
});

test('it closes as done, not dropped, when a condition and the subject PR both settled', () => {
  const closure = pickClosure([{ condition: { kind: 'issue', ref: 'KET-7' }, verdict: { kind: 'settled', what: 'Done' } }], { ref: 'kettle-co/kettle#4', verdict: { kind: 'settled', what: 'merged' } });

  expect(closure).toStrictEqual({ to: 'done', note: 'settled: issue:KET-7 Done' });
});

test('it drops the item when only its subject PR settled', () => {
  const closure = pickClosure([{ condition: { kind: 'issue', ref: 'KET-7' }, verdict: { kind: 'waiting' } }], { ref: 'kettle-co/kettle#4', verdict: { kind: 'settled', what: 'closed' } });

  expect(closure).toStrictEqual({ to: 'dropped', note: 'kettle-co/kettle#4 closed on GitHub' });
});

test('it keeps the item open when nothing settled or a read failed', () => {
  const closure = pickClosure([{ condition: { kind: 'doc', ref: 'abc123def456' }, verdict: { kind: 'failed', error: 'invented: Linear is down' } }], {
    ref: 'kettle-co/kettle#4',
    verdict: { kind: 'waiting' },
  });

  expect(closure).toStrictEqual({ to: 'open' });
});

test('it keeps the item open when it has no condition and no subject PR', () => {
  const closure = pickClosure([], null);

  expect(closure).toStrictEqual({ to: 'open' });
});

import { expect, test } from 'bun:test';
import { pickRepoProbes } from './pick-repo-probes.ts';

test('it asks about a label with no stored check', () => {
  expect(pickRepoProbes(['kettle'], {})).toStrictEqual({ known: {}, probes: [{ name: 'kettle', repo: 'kettle' }] });
});

test('it reuses a stored check that found the repo', () => {
  expect(pickRepoProbes(['kettle'], { kettle: true })).toStrictEqual({ known: { kettle: true }, probes: [] });
});

test('it asks about the repo a label maps to', () => {
  expect(pickRepoProbes(['imp'], {})).toStrictEqual({ known: {}, probes: [{ name: 'imp', repo: 'impz' }] });
});

test('it skips a label that names no repo', () => {
  expect(pickRepoProbes(['frankie'], {})).toStrictEqual({ known: {}, probes: [] });
});

test('it asks again about a label whose repo was missing, so a repo made since is found', () => {
  expect(pickRepoProbes(['kettle'], { kettle: false })).toStrictEqual({ known: {}, probes: [{ name: 'kettle', repo: 'kettle' }] });
});

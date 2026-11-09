import { expect, test } from 'bun:test';
import { buildMockNewRunSession } from './build-mock-new-run-session.ts';

test('it builds a default new run session', () => {
  expect(buildMockNewRunSession()).toStrictEqual({ issue: 'GEO-9001', session: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockNewRunSession({ issue: 'GEO-9002' })).toStrictEqual({ issue: 'GEO-9002', session: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
});

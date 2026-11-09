import { expect, test } from 'bun:test';
import { buildMockOutageInput } from './build-mock-outage-input.ts';

test('it builds a default outage input', () => {
  expect(buildMockOutageInput()).toStrictEqual({ startedAt: '2026-10-14T00:50:00Z', detectedAt: '2026-10-14T00:53:00Z', kind: 'down' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockOutageInput({ kind: 'unready' })).toStrictEqual({ startedAt: '2026-10-14T00:50:00Z', detectedAt: '2026-10-14T00:53:00Z', kind: 'unready' });
});

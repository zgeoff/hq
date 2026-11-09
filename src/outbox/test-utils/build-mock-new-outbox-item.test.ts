import { expect, test } from 'bun:test';
import { buildMockNewOutboxItem } from './build-mock-new-outbox-item.ts';

test('it builds a default new outbox item', () => {
  expect(buildMockNewOutboxItem()).toStrictEqual({ target: 'kettle-bot', text: 'Invented kettle note', topic: null });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockNewOutboxItem({ target: 'z-urn', topic: 'descale' })).toStrictEqual({ target: 'z-urn', text: 'Invented kettle note', topic: 'descale' });
});

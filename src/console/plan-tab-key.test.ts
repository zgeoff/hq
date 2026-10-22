import { expect, test } from 'bun:test';
import { planTabKey } from './plan-tab-key.ts';
import type { TabKeyInput } from './plan-tab-key.ts';

function buildInput(over: Partial<TabKeyInput>): TabKeyInput {
  return { key: 'g', inText: false, modified: false, current: 'needs-you', pendingSince: null, now: 10_000, ...over };
}

test('g then a tab\'s key jumps to it, within 1.5 s of the g', () => {
  expect(planTabKey(buildInput({ key: 'g' }))).toStrictEqual({ pendingSince: 10_000, go: null, consumed: true });
  expect([planTabKey(buildInput({ key: 's', pendingSince: 9000 })), planTabKey(buildInput({ key: 'n', pendingSince: 9000, current: 'shipped' }))]).toStrictEqual([
    { pendingSince: null, go: '/shipped', consumed: true },
    { pendingSince: null, go: '/', consumed: true },
  ]);
  expect(planTabKey(buildInput({ key: 's', pendingSince: 8000 }))).toStrictEqual({ pendingSince: null, go: null, consumed: false });
});

test('after g, a key no tab owns passes on to the tab', () => {
  expect(planTabKey(buildInput({ key: 'y', pendingSince: 9500, current: 'shipped' }))).toStrictEqual({ pendingSince: null, go: null, consumed: false });
});

test('after g, [ and ] still step, and another g waits again', () => {
  expect([planTabKey(buildInput({ key: ']', pendingSince: 9500 })), planTabKey(buildInput({ key: 'g', pendingSince: 9500 }))]).toStrictEqual([
    { pendingSince: null, go: '/shipped', consumed: true },
    { pendingSince: 10_000, go: null, consumed: true },
  ]);
});

test('[ and ] step to the previous and next tab, wrapping round', () => {
  expect([planTabKey(buildInput({ key: ']' })).go, planTabKey(buildInput({ key: '[' })).go, planTabKey(buildInput({ key: ']', current: 'shipped' })).go]).toStrictEqual(['/shipped', '/shipped', '/']);
});

test.each([
  ['in a text box', { inText: true, key: 'g' }],
  ['in a text box after g', { inText: true, key: 's', pendingSince: 9900 }],
  ['with a modifier', { modified: true, key: ']' }],
  ['on a tab\'s own key', { key: 't' }],
])('no tab key fires %s', (_name, over) => {
  expect(planTabKey(buildInput(over))).toStrictEqual({ pendingSince: null, go: null, consumed: false });
});

import { expect, test } from 'bun:test';
import { findNoslopCap } from './find-noslop-cap.ts';

test('it finds the cap of a zgeoff repo stored under its lower-case name', () => {
  expect(findNoslopCap({ repos: ['widgets'], sha: null, caps: { widgets: 2 } }, 'zgeoff', 'widgets')).toBe(2);
});

test('it finds a cap whatever the case of the owner, the repo or the stored name, as the noslop list does', () => {
  expect(findNoslopCap({ repos: ['Widgets'], sha: null, caps: { Widgets: 3 } }, 'ZGeoff', 'WIDGETS')).toBe(3);
});

test('it finds no cap for a repo of the same name under another owner', () => {
  expect(findNoslopCap({ repos: ['widgets'], sha: null, caps: { widgets: 2 } }, 'teapot', 'widgets')).toBeNull();
});

test('it finds no cap for a repo with none', () => {
  expect(findNoslopCap({ repos: ['widgets'], sha: null, caps: { gadgets: 2 } }, 'zgeoff', 'widgets')).toBeNull();
});

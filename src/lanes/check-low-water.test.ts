import { expect, test } from 'bun:test';
import { checkLowWater } from './check-low-water.ts';

test.each([
  { action: 'started', from: 'none', allowed: true },
  { action: 'started', from: 'open', allowed: false },
  { action: 'ended', from: 'open', allowed: true },
  { action: 'ended', from: 'none', allowed: false },
] as const)('#checkLowWater allows $action from $from: $allowed', (row) => {
  const check = () => checkLowWater(row.action, row.from);

  if (row.allowed) {
    expect(check).not.toThrow();
  } else {
    expect(check).toThrow(`low-water episode is ${row.from}`);
  }
});

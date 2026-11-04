import { expect, test } from 'bun:test';
import { parseFocusReserves } from './parse-focus-reserves.ts';

test('it takes a reserve for a stored label with a digit, an underscore or a dot', () => {
  expect(parseFocusReserves(['kettle2=1', 'tea_pot=2', 'tea.pot=3'], ['kettle2', 'tea_pot', 'tea.pot'])).toStrictEqual([
    { area: 'kettle2', slots: 1 },
    { area: 'tea_pot', slots: 2 },
    { area: 'tea.pot', slots: 3 },
  ]);
});

test('it refuses a reserve for a name not on the list', () => {
  expect(() => parseFocusReserves(['teapot=1'], ['kettle'])).toThrow('focus: bad --reserve "teapot=1"');
});

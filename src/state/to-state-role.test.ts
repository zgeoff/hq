import { expect, test } from 'bun:test';
import { toStateRole } from './to-state-role.ts';

test.each([
  ['z-kettle', 'kettle'],
  ['kettle', 'kettle'],
])('it gives %p the state role %p', (sessionName, role) => {
  expect(toStateRole(sessionName)).toBe(role);
});

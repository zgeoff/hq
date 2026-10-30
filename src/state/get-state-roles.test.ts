import { expect, test } from 'bun:test';
import { getStateRoles } from './get-state-roles.ts';

test('#getStateRoles a declared z-<role> session gives the role', () => {
  expect(getStateRoles()).toContain('delivery');
});

test('#getStateRoles no role keeps the z- prefix', () => {
  expect(getStateRoles().filter((role) => role.startsWith('z-'))).toStrictEqual([]);
});

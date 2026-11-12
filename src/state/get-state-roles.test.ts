import { expect, test } from 'bun:test';
import { getStateRoles } from './get-state-roles.ts';
import { roleName } from '../roles/role-name.ts';
import { toStateRole } from './to-state-role.ts';

test('#getStateRoles a declared z-<role> session gives the role', () => {
  expect(getStateRoles()).toContain('delivery');
});

test("#getStateRoles the owner's session gives a role, with or without the z- prefix", () => {
  expect(getStateRoles()).toContain(toStateRole(roleName('owner')));
});

test('#getStateRoles no role keeps the z- prefix', () => {
  expect(getStateRoles().filter((role) => role.startsWith('z-'))).toStrictEqual([]);
});

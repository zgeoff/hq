import { expect, test } from 'bun:test';
import { getStateOwner } from './get-state-owner.ts';
import { roleName } from '../roles/role-name.ts';
import { toStateRole } from './to-state-role.ts';

test("it names the owner's declared session as the owner of its state file", () => {
  const owner = roleName('owner');

  expect(getStateOwner(toStateRole(owner))).toBe(owner);
});

test('it names a declared z- session as the owner of its role', () => {
  expect(getStateOwner('delivery')).toBe('z-delivery');
});

test('it names z-<role> for a role no declared session holds', () => {
  expect(getStateOwner('kettle')).toBe('z-kettle');
});

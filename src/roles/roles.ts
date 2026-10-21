// The fleet's roles: one declared table (fleet.json, hq decision 21: the fleet is a data file, not a
// code literal). Session names live there and nowhere else in src/. bun build --compile bundles the JSON.
import table from '../../fleet.json';
import type { RolesTable } from './types.ts';
import { validateRoles } from './validate-roles.ts';

export const ROLES: RolesTable = validateRoles(table);

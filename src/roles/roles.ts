import table from '../../fleet.json';
import type { RolesTable } from './types.ts';
import { validateRoles } from './validate-roles.ts';

export const ROLES: RolesTable = validateRoles(table);

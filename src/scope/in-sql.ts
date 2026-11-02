import { IN_SCOPE } from './in-scope.ts';

// The names are fixed and checked here, so the list is safe inline in SQL.
if (!IN_SCOPE.every((r) => /^[a-z0-9-]+$/.test(r))) throw new Error('IN_SCOPE holds a name that is not a plain repo name');
export const IN_SQL = `(${IN_SCOPE.map((r) => `'${r}'`).join(', ')})`;

import { IN_SCOPE } from './in-scope.ts';

// For SQL over stored rows: rows of a repo now out stay in the database (it may come back in),
// but no count reads them. The names are fixed above and checked here, so the list is safe inline.
if (!IN_SCOPE.every((r) => /^[a-z0-9-]+$/.test(r))) throw new Error('IN_SCOPE holds a name that is not a plain repo name');
export const IN_SQL = `(${IN_SCOPE.map((r) => `'${r}'`).join(', ')})`;

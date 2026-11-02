import type { PermissionRow } from './types.ts';

const CODE_DELIVERY = 'Code delivery';
const SLOT = /<[^<>\n]+>/u;

export function buildPermissions(actions: readonly string[], rows: readonly PermissionRow[], repo: string): { names: string[]; lines: string[]; unfilled: string[] } {
  const names = pickPermissionNames([CODE_DELIVERY, ...actions], rows);
  return { names, ...buildPermissionLines(names, rows, repo) };
}

export function pickPermissionNames(actions: readonly string[], rows: readonly PermissionRow[]): string[] {
  const wanted: string[] = [];
  for (const action of actions.map((name) => pickRowName(rows, name))) {
    if (!wanted.some((name) => name.toLowerCase() === action.toLowerCase())) {
      wanted.push(action);
    }
  }
  return wanted;
}

export function buildPermissionLines(names: readonly string[], rows: readonly PermissionRow[], repo: string): { lines: string[]; unfilled: string[] } {
  const lines: string[] = [];
  const unfilled: string[] = [];
  for (const action of names) {
    const row = rows.find((candidate) => candidate.action.toLowerCase() === action.toLowerCase());
    if (row === undefined) {
      unfilled.push(`permissions:${action} (no wording)`);
      continue;
    }
    const phrase = row.phrase.replaceAll('<repo>', repo);
    lines.push(phrase);
    if (SLOT.test(phrase)) {
      unfilled.push(`permissions:${row.action}`);
    }
  }
  return { lines, unfilled };
}

// An Actions line may add its detail after the name with no comma or colon, as in "Code delivery in
// zgeoff/kettle".
function pickRowName(rows: readonly PermissionRow[], action: string): string {
  const name = action.toLowerCase();
  const exact = rows.find((row) => row.action.toLowerCase() === name);
  if (exact !== undefined) {
    return exact.action;
  }
  const opening = rows.filter((row) => name.startsWith(`${row.action.toLowerCase()} `)).toSorted((left, right) => right.action.length - left.action.length);
  return opening[0]?.action ?? action;
}

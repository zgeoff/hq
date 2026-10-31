import type { PermissionRow } from './types.ts';

const CODE_DELIVERY = 'Code delivery';
const SLOT = /<[^<>\n]+>/u;

// The permission lines for the issue's Actions, Code delivery first and each action once, with the
// repo in place of `<repo>`. A phrase that still holds another slot, or an action with no row,
// goes into `unfilled` for the launcher.
export function buildPermissions(actions: readonly string[], rows: readonly PermissionRow[], repo: string): { lines: string[]; unfilled: string[] } {
  const wanted: string[] = [CODE_DELIVERY];
  for (const action of actions.map((name) => pickRowName(rows, name))) {
    if (!wanted.some((name) => name.toLowerCase() === action.toLowerCase())) {
      wanted.push(action);
    }
  }
  const lines: string[] = [];
  const unfilled: string[] = [];
  for (const action of wanted) {
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
// zgeoff/kettle", so a row whose name opens the line as whole words names it; the longest such row wins.
function pickRowName(rows: readonly PermissionRow[], action: string): string {
  const name = action.toLowerCase();
  if (rows.some((row) => row.action.toLowerCase() === name)) {
    return action;
  }
  const opening = rows.filter((row) => name.startsWith(`${row.action.toLowerCase()} `)).toSorted((left, right) => right.action.length - left.action.length);
  return opening[0]?.action ?? action;
}

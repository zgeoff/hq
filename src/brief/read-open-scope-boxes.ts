import { readScopeLines } from './read-scope-lines.ts';

export interface OpenScopeBox {
  // The box's first word as the box writes it, with backticks removed.
  name: string;

  // True when the name reads like a repo, so the launch line can list it.
  readsAsRepo: boolean;
}

const OPEN_BOX = /^\s*[-*] \[ \] (?<text>.*)$/u;
const FIRST_WORD = /^[A-Za-z0-9-]*/u;
const REPO_NAME = /^`?[a-z0-9][a-z0-9-]*`?(?:$|[:#,.)])/u;

// The unticked Scope boxes whose first word is not one of the launch area's names.
export function readOpenScopeBoxes(description: string, ownNames: readonly string[]): OpenScopeBox[] {
  const own = new Set(ownNames.map((name) => name.toLowerCase()));
  const boxes: OpenScopeBox[] = [];
  for (const line of readScopeLines(description)) {
    const text = OPEN_BOX.exec(line)?.groups?.['text']?.trim();
    if (text === undefined) {
      continue;
    }
    const name = FIRST_WORD.exec(text.replace(/^`+/u, ''))?.[0] ?? '';
    if (!own.has(name.toLowerCase())) {
      boxes.push({ name, readsAsRepo: REPO_NAME.test(text) });
    }
  }
  return boxes;
}

import { readScopeLines } from '../brief/read-scope-lines.ts';

const OPEN_BOX = /^\s*(?:[-*+]|\d+[.)])\s+\[ \](?:\s+(?<text>.*))?\s*$/u;

const EMPTY_BOX_TEXT = '(empty box)';

// The trimmed text of every unticked box in the Scope section.
export function listOpenScopeBoxTexts(description: string): string[] {
  const texts: string[] = [];
  for (const line of readScopeLines(description)) {
    const match = OPEN_BOX.exec(line);
    if (match !== null) {
      texts.push(match.groups?.['text']?.trim() || EMPTY_BOX_TEXT);
    }
  }
  return texts;
}

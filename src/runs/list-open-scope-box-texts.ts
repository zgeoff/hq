import { readScopeLines } from '../brief/read-scope-lines.ts';

const OPEN_BOX = /^\s*(?:[-*+]|\d+[.)])\s+\[ \]\s+(?<text>.*)$/u;

// The trimmed text of every unticked box in the Scope section.
export function listOpenScopeBoxTexts(description: string): string[] {
  const texts: string[] = [];
  for (const line of readScopeLines(description)) {
    const text = OPEN_BOX.exec(line)?.groups?.['text']?.trim();
    if (text !== undefined && text !== '') {
      texts.push(text);
    }
  }
  return texts;
}

import { readOpenScopeBoxes } from '../brief/read-open-scope-boxes.ts';

export type IssueRead = { ok: true; description: string } | { ok: false; reason: string };

export type HandedInHold = { hold: false } | { hold: true; why: 'open-boxes'; openBoxes: number } | { hold: true; why: 'read-failed'; reason: string };

// A run that waits on more parts to launch stays working while its Linear Scope has an open box.
// The read is null when the run waits on nothing, so Linear was never asked.
export function decideHandedInHold(waitsOn: string | null, read: IssueRead | null): HandedInHold {
  if (waitsOn === null || waitsOn.trim() === '') {
    return { hold: false };
  }
  if (read === null || !read.ok) {
    return { hold: true, why: 'read-failed', reason: read === null ? 'no Linear read' : read.reason };
  }
  const openBoxes = readOpenScopeBoxes(read.description, []).length;
  return openBoxes > 0 ? { hold: true, why: 'open-boxes', openBoxes } : { hold: false };
}

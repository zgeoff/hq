import { listOpenScopeBoxTexts } from './list-open-scope-box-texts.ts';

export type IssueRead = { ok: true; description: string } | { ok: false; reason: string };

export type HandedInHold = { hold: false } | { hold: true; why: 'open-boxes'; boxes: string[] } | { hold: true; why: 'read-failed'; reason: string };

// A run that waits on more parts to launch stays working while its Linear Scope has an open box.
// The read is null when the run waits on nothing, so Linear was never asked.
export function decideHandedInHold(waitsOn: string | null, read: IssueRead | null): HandedInHold {
  if (waitsOn === null || waitsOn.trim() === '') {
    return { hold: false };
  }
  if (read === null || !read.ok) {
    return { hold: true, why: 'read-failed', reason: read === null ? 'no Linear read' : read.reason };
  }
  const texts = listOpenScopeBoxTexts(read.description);
  return texts.length > 0 ? { hold: true, why: 'open-boxes', boxes: texts } : { hold: false };
}

import type { TestDeps } from './test-deps.ts';

export function seedAskAnswerEventWithNumber(deps: TestDeps): void {
  // An answered-ask event whose answer is a number: the answer writers only store text.
  deps.db.run(`UPDATE events SET data = '{"answer":42}' WHERE subject = 'ask' AND action = 'answered'`);
}

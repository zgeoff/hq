import { expect, test } from 'bun:test';
import { formatAnswerLine } from './format-answer-line.ts';
import type { Answer } from './types.ts';

test('an answer prints its time, kind, id, title, session and pick, with the words indented below', () => {
  const answer: Answer = { source: 'ask', id: 'kettle-descale', kind: 'call', title: 'Descale the kettle', issues: [], session: 'kettle-bot', picked: 'Descale it', stuPick: true, words: 'Use the citric acid.\nThen rinse.', ref: null, via: 'console', at: '2026-10-14T01:01:00Z' };
  expect(formatAnswerLine(answer)).toBe('2026-10-14T01:01:00Z call kettle-descale "Descale the kettle" for kettle-bot: Descale it (Stu\'s pick)\n    Use the citric acid.\n    Then rinse.');
  expect(formatAnswerLine({ ...answer, source: 'typed', id: '7', title: null, session: null, picked: null, stuPick: null, words: null })).toBe('2026-10-14T01:01:00Z call 7');
});

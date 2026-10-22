import { expect, test } from 'bun:test';
import { parsePickedOption } from './parse-picked-option.ts';

const OPTIONS = [
  { label: 'Descale it', effect: 'The kettle gets descaled.', recommended: true },
  { label: 'Descale it later', effect: 'It waits a week.' },
];

test('a console answer picks its option, says whether it was Stu\'s pick, and keeps the note as words', () => {
  expect(parsePickedOption('Descale it', OPTIONS)).toStrictEqual({ picked: 'Descale it', stuPick: true, words: null });
  expect(parsePickedOption('Descale it later | Not this week.', OPTIONS)).toStrictEqual({ picked: 'Descale it later', stuPick: false, words: 'Not this week.' });
});

test('an answer that matches no label exactly picks nothing and is all words', () => {
  expect(parsePickedOption('agree (option 1)', OPTIONS)).toStrictEqual({ picked: null, stuPick: null, words: 'agree (option 1)' });
  expect(parsePickedOption('Descale it soon', OPTIONS)).toStrictEqual({ picked: null, stuPick: null, words: 'Descale it soon' });
  expect(parsePickedOption('Descale it', [])).toStrictEqual({ picked: null, stuPick: null, words: 'Descale it' });
});

test.each([
  ['Keep | archive', { picked: 'Keep | archive', stuPick: false, words: null }],
  ['Keep | archive | Before Friday.', { picked: 'Keep | archive', stuPick: false, words: 'Before Friday.' }],
  ['Keep | Before Friday.', { picked: 'Keep', stuPick: true, words: 'Before Friday.' }],
])('it picks the option whose whole label the answer %p holds, before a shorter label that leads it', (answer, picked) => {
  expect(parsePickedOption(answer, [{ label: 'Keep', effect: 'It stays.', recommended: true }, { label: 'Keep | archive', effect: 'It moves to the archive.' }])).toStrictEqual(picked);
});

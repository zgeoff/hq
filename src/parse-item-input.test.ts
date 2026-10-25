import { expect, test } from 'bun:test';
import { parseItemInput } from './parse-item-input.ts';
import type { ItemOption } from './parse-item-input.ts';

const KETTLE_CALL = {
  title: 'Mint the kettle tokens',
  question: 'Mint the `kettle` tokens tonight?',
  deadline: 'before 08:00',
  options: [
    { label: 'Yes, mint them', effect: 'The kettle starts at 07:00.', recommended: true },
    { label: 'Not yet', effect: 'The kettle waits a day.' },
  ],
  stuView: 'Minting now keeps the morning boil on time.',
  details: [{ heading: 'Evidence', text: 'The last boil took 9 min.', code: 'kettle boil --dry-run' }],
  unblocks: [{ id: 'GEO-12', title: 'Morning boil' }],
  links: [{ label: 'Runbook', url: 'https://example.com/kettle' }],
};

test('it reads a call with every field, verbatim', () => {
  expect(parseItemInput('call', JSON.stringify(KETTLE_CALL))).toStrictEqual(KETTLE_CALL);
});

test('it fills the empty lists an item may leave out', () => {
  expect(parseItemInput('call', JSON.stringify({ title: 'Lid', question: 'Fit the lid?', options: KETTLE_CALL.options }))).toStrictEqual({
    title: 'Lid',
    question: 'Fit the lid?',
    options: KETTLE_CALL.options,
    details: [],
    unblocks: [],
    links: [],
  });
});

test.each([
  ['a title over 80 characters', { ...KETTLE_CALL, title: 'k'.repeat(81) }, 'title'],
  ['one option', { ...KETTLE_CALL, options: [KETTLE_CALL.options[0]] }, 'options'],
  ['five options', { ...KETTLE_CALL, options: Array.from({ length: 5 }, (_, i) => ({ label: `L${i}`, effect: 'E' })) }, 'options'],
  ['an unknown field', { ...KETTLE_CALL, colour: 'blue' }, 'colour'],
  ['a link that is not http', { ...KETTLE_CALL, links: [{ label: 'x', url: ['javascript', 'alert(1)'].join(':') }] }, 'links.0.url'],
  ['an empty question', { ...KETTLE_CALL, question: '  ' }, 'question'],
])('it refuses %s', (_name, item, field) => {
  expect(() => parseItemInput('call', JSON.stringify(item))).toThrow(field);
});

test('it refuses text that is not JSON', () => {
  expect(() => parseItemInput('call', '{kettle')).toThrow('--item is not JSON');
});

test('it needs options on a call, a diff on a proposal, and no options on an unblock item', () => {
  const { options: _options, ...noOptions } = KETTLE_CALL;
  expect(() => parseItemInput('call', JSON.stringify(noOptions))).toThrow('needs 2 to 4 options');
  expect(() => parseItemInput('proposal', JSON.stringify(KETTLE_CALL))).toThrow('needs its diff');
  expect(parseItemInput('proposal', JSON.stringify({ ...KETTLE_CALL, diff: { now: 'Boil at 7.', would: 'Boil at 6.' } })).diff).toStrictEqual({ now: 'Boil at 7.', would: 'Boil at 6.' });
  expect(() => parseItemInput('unblock', JSON.stringify(KETTLE_CALL))).toThrow('takes no options');
  expect(parseItemInput('unblock', JSON.stringify(noOptions)).title).toBe('Mint the kettle tokens');
});

test('it keeps the spaces and line breaks around a text', () => {
  const item = parseItemInput('call', JSON.stringify({ ...KETTLE_CALL, question: '  Mint them?\n', details: [{ heading: 'Log', text: '\n  line one\n' }] }));

  expect(item.question).toBe('  Mint them?\n');
  expect(item.details).toStrictEqual([{ heading: 'Log', text: '\n  line one\n' }]);
});

test('it reads a call option that grants an override or an accepted risk', () => {
  const options: ItemOption[] = [
    { label: 'Override', effect: 'It merges past the findings.', grants: { action: 'override', pr: 'zgeoff/kettle#4', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' } },
    { label: 'Accept it', effect: 'It merges with the risk.', grants: { action: 'accept-risk', pr: 'zgeoff/kettle#4', finding: 'aaaa' } },
    { label: 'Pass the check', effect: 'It merges past one red check.', grants: { action: 'override', pr: 'zgeoff/kettle#4', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', check: 'preview' } },
  ];

  expect(parseItemInput('call', JSON.stringify({ title: 'Lid', question: 'Merge kettle#4?', options })).options).toStrictEqual(options);
});

test.each([
  ['an override that names a finding', 'call', { action: 'override', pr: 'zgeoff/kettle#4', finding: 'aaaa' }, 'an override grant names none'],
  ['an accepted risk with no finding', 'call', { action: 'accept-risk', pr: 'zgeoff/kettle#4' }, 'an accept-risk grant names its finding'],
  ['a PR that is not owner/repo#number', 'call', { action: 'override', pr: 'kettle#4' }, 'must be <owner>/<repo>#<number>'],
  ['an action hq does not know', 'call', { action: 'merge', pr: 'zgeoff/kettle#4' }, 'options.0.grants.action'],
  ['a grant on a proposal option', 'proposal', { action: 'override', pr: 'zgeoff/kettle#4' }, 'only a call\'s option does'],
  ['an accepted risk that names a CI check', 'call', { action: 'accept-risk', pr: 'zgeoff/kettle#4', finding: 'aaaa', check: 'preview' }, 'only an override grant names a CI check'],
  ['a grant head that is not a commit sha', 'call', { action: 'override', pr: 'zgeoff/kettle#4', head: 'a1b2c3d' }, 'must be a 40-character commit sha'],
] as const)('it refuses %s', (_case, kind, grants, why) => {
  const item = { title: 'Lid', question: 'Merge kettle#4?', diff: { now: 'Open.', would: 'Merged.' }, options: [{ label: 'Go', effect: 'It merges.', grants }, { label: 'Wait', effect: 'It waits.' }] };

  expect(() => parseItemInput(kind, JSON.stringify(item))).toThrow(why);
});

test('an unblock item may mark one GitHub PR link as its subject', () => {
  const context = { label: 'Runbook', url: 'https://example.com/kettle' },
    pr = { label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true as const },
    todo = { title: 'Review kettle#4', question: 'Review kettle#4 and say lgtm', links: [pr, context] };

  expect(parseItemInput('unblock', JSON.stringify(todo)).links).toStrictEqual([pr, context]);
  expect(() => parseItemInput('unblock', JSON.stringify({ ...todo, links: [pr, { ...pr, label: 'again' }] }))).toThrow('one subject link at most');
  expect(() => parseItemInput('unblock', JSON.stringify({ ...todo, links: [{ ...context, subject: true }] }))).toThrow('must be a GitHub pull request URL');
  expect(() => parseItemInput('unblock', JSON.stringify({ ...todo, links: [{ ...pr, subject: false }] }))).toThrow('links.0.subject');
  expect(() => parseItemInput('call', JSON.stringify({ ...KETTLE_CALL, links: [pr] }))).toThrow('a call takes no subject link');
});

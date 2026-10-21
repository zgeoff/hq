import { expect, test } from 'bun:test';
import { parseItemInput } from './parse-item-input.ts';
import { renderItemBody } from './render-item-body.ts';

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

test('it renders a plain body from the details, diff and options', () => {
  const item = parseItemInput('proposal', JSON.stringify({ ...KETTLE_CALL, diff: { now: 'Boil at 7.', would: 'Boil at 6.' } }));

  expect(renderItemBody(item)).toBe(
    [
      '## Evidence\nThe last boil took 9 min.\n```\nkettle boil --dry-run\n```',
      '## Now\nBoil at 7.\n\n## Would read\nBoil at 6.',
      "## Options\n1. Yes, mint them: The kettle starts at 07:00. (Stu's pick)\n2. Not yet: The kettle waits a day.",
    ].join('\n\n'),
  );
});

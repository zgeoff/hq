import { expect, test } from 'bun:test';
import { parseItemInput } from './parse-item-input.ts';
import { splitItemExtras } from './split-item-extras.ts';

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

test('it keeps the stored fields apart from the title, question and Stu view', () => {
  const item = parseItemInput('call', JSON.stringify(KETTLE_CALL));

  expect(splitItemExtras(item)).toStrictEqual({
    deadline: 'before 08:00',
    options: KETTLE_CALL.options,
    details: KETTLE_CALL.details,
    unblocks: KETTLE_CALL.unblocks,
    links: KETTLE_CALL.links,
  });
});

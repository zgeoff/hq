import { expect, test } from 'bun:test';
import { parseRecordLine } from './parse-record-line.ts';

test('#parseRecordLine joins the section into one line and puts the issue in place of <GEO-n>', () => {
  const markdown = ['# design brief', '', '## Design brief (the record line)', '', 'You should file the kettle record on <GEO-n>,', 'and its follow-ups in Triage.', '', '## the closing', '', 'Not this.', ''].join('\n');

  expect(parseRecordLine(markdown, 'GEO-9001')).toBe('You should file the kettle record on GEO-9001, and its follow-ups in Triage.');
});

test('#parseRecordLine returns null when the heading is missing', () => {
  expect(parseRecordLine('# design brief\n\n## other\n\nText.\n', 'GEO-9001')).toBeNull();
});

test('#parseRecordLine returns null when the section under the heading is empty', () => {
  expect(parseRecordLine('## Design brief (the record line)\n\n## next\n', 'GEO-9001')).toBeNull();
});

import { expect, test } from 'bun:test';
import { parseFocusTerms } from './parse-focus-terms.ts';

test('it splits terms by comma and filters by colon', () => {
  expect(parseFocusTerms('Bug, roadmap:vers:medium+, label=enabler:project=kettle roadmap')).toStrictEqual([
    { text: 'Bug', filters: [{ kind: 'type', value: 'bug' }] },
    {
      text: 'roadmap:vers:medium+',
      filters: [
        { kind: 'class', value: 'roadmap' },
        { kind: 'area', value: 'vers' },
        { kind: 'priority', value: 'medium+' },
      ],
    },
    {
      text: 'label=enabler:project=kettle roadmap',
      filters: [
        { kind: 'label', value: 'enabler' },
        { kind: 'project', value: 'kettle roadmap' },
      ],
    },
  ]);
});

test('it refuses an empty term', () => {
  expect(() => parseFocusTerms('bug,,chore')).toThrow('focus: an empty term in "bug,,chore"');
});

test('it refuses the Design type, which takes the design slot', () => {
  expect(() => parseFocusTerms('design')).toThrow('focus: unknown filter "design" in term "design"');
});

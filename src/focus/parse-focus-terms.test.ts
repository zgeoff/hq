import { expect, test } from 'bun:test';
import { parseFocusTerms } from './parse-focus-terms.ts';
import { FOCUS_AREAS } from './focus-areas.ts';

test('it splits terms by comma and filters by colon', () => {
  expect(parseFocusTerms('Bug, roadmap:vers:medium+, label=enabler:project=kettle roadmap', FOCUS_AREAS)).toStrictEqual([
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

test('it reads each area hq knows, the noslop, skills, wulez, boxxy, llm and nixie-definitions labels included', () => {
  expect(parseFocusTerms('noslop, skills, wulez, boxxy, llm, nixie-definitions:bug', FOCUS_AREAS)).toStrictEqual([
    { text: 'noslop', filters: [{ kind: 'area', value: 'noslop' }] },
    { text: 'skills', filters: [{ kind: 'area', value: 'skills' }] },
    { text: 'wulez', filters: [{ kind: 'area', value: 'wulez' }] },
    { text: 'boxxy', filters: [{ kind: 'area', value: 'boxxy' }] },
    { text: 'llm', filters: [{ kind: 'area', value: 'llm' }] },
    {
      text: 'nixie-definitions:bug',
      filters: [
        { kind: 'area', value: 'nixie-definitions' },
        { kind: 'type', value: 'bug' },
      ],
    },
  ]);
});

test('it refuses an empty term', () => {
  expect(() => parseFocusTerms('bug,,chore', FOCUS_AREAS)).toThrow('focus: an empty term in "bug,,chore"');
});

test('it refuses the Design type, which takes the design slot', () => {
  expect(() => parseFocusTerms('design', FOCUS_AREAS)).toThrow('focus: unknown filter "design" in term "design"');
});

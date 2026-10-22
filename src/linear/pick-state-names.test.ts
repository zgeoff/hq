import { expect, test } from 'bun:test';
import { pickStateNames } from './pick-state-names.ts';

test("it picks the team's spelling of each state, matched without regard to case", () => {
  expect(pickStateNames(['ready', 'IN REVIEW'], ['Backlog', 'Ready', 'In Review'], 'KET')).toStrictEqual(['Ready', 'In Review']);
});

test('it picks a state named twice once', () => {
  expect(pickStateNames(['Ready', 'ready'], ['Ready'], 'KET')).toStrictEqual(['Ready']);
});

test('it refuses a state the team lacks, listing the team states', () => {
  expect(() => pickStateNames(['Ready', 'Steeping'], ['Backlog', 'Ready'], 'KET')).toThrow(expect.objectContaining({ code: 'bad_args', message: 'unknown state "Steeping" in team KET; its states are Backlog, Ready' }));
});

test('it refuses a team with no states', () => {
  expect(() => pickStateNames(['Ready'], [], 'TEA')).toThrow(expect.objectContaining({ code: 'bad_args', message: 'Linear has no workflow states for team TEA: check the team key' }));
});

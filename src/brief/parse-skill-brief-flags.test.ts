import { expect, test } from 'bun:test';
import { parseSkillBriefFlags } from './parse-skill-brief-flags.ts';

test('it carries the issue, the ref and the kind', () => {
  expect(parseSkillBriefFlags('GEO-9001', { ref: 'refactor/kettle-rebuild' }, 'design')).toStrictEqual({ issue: 'GEO-9001', ref: 'refactor/kettle-rebuild', kind: 'design', repo: null });
});

test('it takes main as the ref when none is given', () => {
  expect(parseSkillBriefFlags('GEO-9001', {}, 'pr-walk')).toStrictEqual({ issue: 'GEO-9001', ref: 'main', kind: 'pr-walk', repo: null });
});

test('it rejects --goal-file with design as a usage error naming the flag', () => {
  expect(() => parseSkillBriefFlags('GEO-9001', { 'goal-file': '/tmp/kettle-goal.md' }, 'design')).toThrow(
    expect.objectContaining({ code: 'bad_args', message: '--goal-file does not apply to --kind design' }),
  );
});

test('it rejects --imp and --issue-by-link with pr-walk, naming each flag', () => {
  expect(() => parseSkillBriefFlags('GEO-9001', { imp: true }, 'pr-walk')).toThrow('--imp does not apply to --kind pr-walk');
  expect(() => parseSkillBriefFlags('GEO-9001', { 'issue-by-link': true }, 'pr-walk')).toThrow('--issue-by-link does not apply to --kind pr-walk');
});

test('it still rejects an issue that is not a Linear ID', () => {
  expect(() => parseSkillBriefFlags('kettle', {}, 'design')).toThrow('hq brief <issue> needs a Linear issue ID such as GEO-123');
});

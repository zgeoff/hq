import { expect, test } from 'bun:test';
import { parseBriefFlags } from './parse-brief-flags.ts';

test('it takes main as the ref and no mode flag when the flags are empty', () => {
  expect(parseBriefFlags('GEO-9001', {})).toStrictEqual({ issue: 'GEO-9001', ref: 'main', imp: false, byLink: false, goalFile: null, repo: null });
});

test('it carries each flag it is given', () => {
  const input = parseBriefFlags('GEO-9001', { ref: 'refactor/kettle-rebuild', imp: true, 'goal-file': '/tmp/kettle-goal.md' });

  expect(input).toStrictEqual({ issue: 'GEO-9001', ref: 'refactor/kettle-rebuild', imp: true, byLink: false, goalFile: '/tmp/kettle-goal.md', repo: null });
});

test('it sends the issue by link with --imp and no --goal-file', () => {
  expect(parseBriefFlags('GEO-9001', { imp: true })).toStrictEqual({ issue: 'GEO-9001', ref: 'main', imp: true, byLink: true, goalFile: null, repo: null });
});

test('it rejects a missing issue and one that is not a Linear ID', () => {
  expect(() => parseBriefFlags(undefined, {})).toThrow('hq brief <issue> needs a Linear issue ID such as GEO-123');
  expect(() => parseBriefFlags('kettle', {})).toThrow('hq brief <issue> needs a Linear issue ID such as GEO-123');
});

test('it rejects a ref with a query, a space or a double dot', () => {
  expect(() => parseBriefFlags('GEO-9001', { ref: 'main?x=1' })).toThrow('--ref must be a branch, tag or commit: main?x=1');
  expect(() => parseBriefFlags('GEO-9001', { ref: 'a..b' })).toThrow('--ref must be a branch, tag or commit: a..b');
});

test('it rejects --issue-by-link with --goal-file', () => {
  expect(() => parseBriefFlags('GEO-9001', { 'issue-by-link': true, 'goal-file': 'kettle.md' })).toThrow('give --issue-by-link or --goal-file, not both');
});

test('it carries --repo, and rejects one that is not an area label', () => {
  expect(parseBriefFlags('GEO-9001', { repo: 'cloud' }).repo).toBe('cloud');
  expect(() => parseBriefFlags('GEO-9001', { repo: 'zgeoff/cloud' })).toThrow('--repo must be an area label or repo such as cloud: zgeoff/cloud');
});

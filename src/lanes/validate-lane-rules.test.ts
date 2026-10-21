import { expect, test } from 'bun:test';
import rulesTable from '../../lanes.json';
import { validateLaneRules } from './validate-lane-rules.ts';

test('it accepts the shipped lanes.json against the shipped pacing lanes', () => {
  expect(validateLaneRules(rulesTable, ['nixie-slice', 'nixie-maintenance', 'atc', 'imp', 'cloud', 'memory', 'flexible', 'cleanup', 'process']).team).toBe('GEO');
});

test('it refuses a lane that pacing.json lacks', () => {
  expect(() => validateLaneRules(rulesTable, ['nixie-slice', 'nixie-maintenance', 'atc', 'imp', 'memory', 'flexible', 'cleanup', 'process'])).toThrow('lane cloud is not in pacing.json');
});

test('it refuses two fallback lanes', () => {
  const raw = { team: 'GEO', readyState: 'Ready', exclude: [], lanes: { atc: { fallback: true }, flexible: { fallback: true } } };

  expect(() => validateLaneRules(raw, ['atc', 'flexible'])).toThrow('exactly one lane must be the fallback (found 2)');
});

test('it refuses rules with no fallback lane', () => {
  const raw = { team: 'GEO', readyState: 'Ready', exclude: [], lanes: { atc: { projects: ['invented project'] } } };

  expect(() => validateLaneRules(raw, ['atc'])).toThrow('exactly one lane must be the fallback (found 0)');
});

test('it refuses an exclusion that names nothing', () => {
  const raw = { team: 'GEO', readyState: 'Ready', exclude: [{ reason: 'invented' }], lanes: { flexible: { fallback: true } } };

  expect(() => validateLaneRules(raw, ['flexible'])).toThrow('exclude.0 names no project or label');
});

test('it refuses an unknown key with the bad_lanes code', () => {
  const raw = { team: 'GEO', readyState: 'Ready', exclude: [], lanes: { flexible: { fallback: true, colour: 'red' } } };

  expect(() => validateLaneRules(raw, ['flexible'])).toThrow(expect.objectContaining({ code: 'bad_lanes', message: expect.stringContaining('lanes.json: lanes.flexible') }));
});

test('it refuses a pacing.json lane that has no rules', () => {
  const raw = { team: 'GEO', readyState: 'Ready', exclude: [], lanes: { flexible: { fallback: true } } };

  expect(() => validateLaneRules(raw, ['flexible', 'atc'])).toThrow('pacing.json lane atc has no rules');
});

test('it refuses a fallback lane that also names a project', () => {
  const raw = { team: 'GEO', readyState: 'Ready', exclude: [], lanes: { flexible: { fallback: true, projects: ['invented project'] } } };

  expect(() => validateLaneRules(raw, ['flexible'])).toThrow('fallback lane flexible takes nothing else');
});

test('it refuses a lane that is not the fallback and names nothing', () => {
  const raw = { team: 'GEO', readyState: 'Ready', exclude: [], lanes: { atc: {}, flexible: { fallback: true } } };

  expect(() => validateLaneRules(raw, ['atc', 'flexible'])).toThrow('lane atc matches nothing');
});

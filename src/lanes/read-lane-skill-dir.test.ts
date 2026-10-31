import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLaneSkillDir } from './read-lane-skill-dir.ts';

function setupTest(skills: readonly string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'hq-lane-skill-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  for (const skill of skills) {
    mkdirSync(join(dir, 'skills', skill, 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'skills', skill, 'scripts', 'capacity.sh'), '#!/bin/sh\n');
  }
  return { dir };
}

test('it reads the lane files from delivery-lead once the rebuilt tree holds them', () => {
  const { dir } = setupTest(['delivery-lead']);

  expect(readLaneSkillDir(dir)).toBe(`${dir}/skills/delivery-lead`);
});

test('it reads the lane files from agent-delegation in the tree before the rebuild', () => {
  const { dir } = setupTest(['agent-delegation']);

  expect(readLaneSkillDir(dir)).toBe(`${dir}/skills/agent-delegation`);
});

test('it prefers delivery-lead when both trees hold the lane files', () => {
  const { dir } = setupTest(['agent-delegation', 'delivery-lead']);

  expect(readLaneSkillDir(dir)).toBe(`${dir}/skills/delivery-lead`);
});

test('it names delivery-lead when neither tree holds the lane files', () => {
  const { dir } = setupTest([]);

  expect(readLaneSkillDir(dir)).toBe(`${dir}/skills/delivery-lead`);
});

import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLaneSkillDir } from './read-lane-skill-dir.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-lane-skill-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return { directory };
}

test('it reads the lane files from delivery-lead once the rebuilt tree holds them', () => {
  const ctx = setupTest();
  mkdirSync(join(ctx.directory, 'skills', 'delivery-lead', 'scripts'), { recursive: true });
  writeFileSync(join(ctx.directory, 'skills', 'delivery-lead', 'scripts', 'capacity.sh'), '#!/bin/sh\n');

  expect(readLaneSkillDir(ctx.directory)).toBe(`${ctx.directory}/skills/delivery-lead`);
});

test('it reads the lane files from agent-delegation in the tree before the rebuild', () => {
  const ctx = setupTest();
  mkdirSync(join(ctx.directory, 'skills', 'agent-delegation', 'scripts'), { recursive: true });
  writeFileSync(join(ctx.directory, 'skills', 'agent-delegation', 'scripts', 'capacity.sh'), '#!/bin/sh\n');

  expect(readLaneSkillDir(ctx.directory)).toBe(`${ctx.directory}/skills/agent-delegation`);
});

test('it prefers delivery-lead when both trees hold the lane files', () => {
  const ctx = setupTest();
  mkdirSync(join(ctx.directory, 'skills', 'agent-delegation', 'scripts'), { recursive: true });
  writeFileSync(join(ctx.directory, 'skills', 'agent-delegation', 'scripts', 'capacity.sh'), '#!/bin/sh\n');
  mkdirSync(join(ctx.directory, 'skills', 'delivery-lead', 'scripts'), { recursive: true });
  writeFileSync(join(ctx.directory, 'skills', 'delivery-lead', 'scripts', 'capacity.sh'), '#!/bin/sh\n');

  expect(readLaneSkillDir(ctx.directory)).toBe(`${ctx.directory}/skills/delivery-lead`);
});

test('it names delivery-lead when neither tree holds the lane files', () => {
  const ctx = setupTest();

  expect(readLaneSkillDir(ctx.directory)).toBe(`${ctx.directory}/skills/delivery-lead`);
});

import { expect, test } from 'bun:test';
import { pickOwnerHeldVerdict } from './pick-owner-held-verdict.ts';

test('it passes a PR that changes no owner-held file, with no lgtm', () => {
  expect(pickOwnerHeldVerdict({ repo: 'widgets', pr: 7, held: [], lgtm: false, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', headNow: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' })).toStrictEqual({ pass: true });
});

test('it blocks a PR that changes no owner-held file when the head moved after its files were read', () => {
  expect(pickOwnerHeldVerdict({ repo: 'widgets', pr: 7, held: [], lgtm: false, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', headNow: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed' })).toStrictEqual({ pass: false, reason: "the PR's head moved from a1b2c3d while the gate ran, so no pass: run the gate again" });
});

test('it blocks owner-held files with no lgtm, naming each file once and the command', () => {
  expect(pickOwnerHeldVerdict({ repo: 'widgets', pr: 7, held: ['skills/kettle/SKILL.md', 'skills/kettle/SKILL.md'], lgtm: false, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', headNow: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' })).toStrictEqual({ pass: false, reason: "the PR changes owner-held files (skills/kettle/SKILL.md) and needs the owner's lgtm at a1b2c3d: hq pr answer widgets 7 lgtm, from the console" });
});

test('it names the first three owner-held files and counts the rest', () => {
  expect(pickOwnerHeldVerdict({ repo: 'widgets', pr: 7, held: ['skills/a/SKILL.md', 'skills/b/SKILL.md', 'skills/c/SKILL.md', 'skills/d/SKILL.md'], lgtm: false, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', headNow: null })).toStrictEqual({ pass: false, reason: "the PR changes owner-held files (skills/a/SKILL.md, skills/b/SKILL.md, skills/c/SKILL.md and 1 more) and needs the owner's lgtm at a1b2c3d: hq pr answer widgets 7 lgtm, from the console" });
});

test('it blocks an lgtm when the head moved while the gate ran', () => {
  expect(pickOwnerHeldVerdict({ repo: 'widgets', pr: 7, held: ['fleet.json'], lgtm: true, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', headNow: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed' })).toStrictEqual({ pass: false, reason: "the PR's head moved from a1b2c3d while the gate ran, so no pass: run the gate again" });
});

test('it blocks an lgtm when the head could not be read again', () => {
  expect(pickOwnerHeldVerdict({ repo: 'widgets', pr: 7, held: ['fleet.json'], lgtm: true, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', headNow: null })).toStrictEqual({ pass: false, reason: "the PR's head moved from a1b2c3d while the gate ran, so no pass: run the gate again" });
});

test('it passes owner-held files with an lgtm at a head that did not move', () => {
  expect(pickOwnerHeldVerdict({ repo: 'widgets', pr: 7, held: ['fleet.json'], lgtm: true, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', headNow: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' })).toStrictEqual({ pass: true });
});

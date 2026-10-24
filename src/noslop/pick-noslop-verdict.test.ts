import { expect, test } from 'bun:test';
import { pickNoslopVerdict } from './pick-noslop-verdict.ts';

test('it blocks when noslop has posted no summary, naming the command to review the PR', () => {
  expect(pickNoslopVerdict({ overridden: false, repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', summary: { found: false, reason: 'noslop has posted no review summary on the PR' }, recorded: 0, findings: { read: true, open: [], listed: 0 }, headNow: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' })).toStrictEqual({ pass: false, reason: 'noslop has posted no review summary on the PR, so no pass: hq review widgets 7' });
});

test("it blocks when noslop's last review read an older head, naming both heads", () => {
  expect(pickNoslopVerdict({ overridden: false, repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', summary: { found: true, head: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed' }, recorded: 0, findings: { read: true, open: [], listed: 1 }, headNow: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' })).toStrictEqual({ pass: false, reason: 'noslop has not reviewed head a1b2c3d (its last review read f00dfee); run hq review widgets 7' });
});

test('it blocks when the findings could not be read, with the cause', () => {
  expect(pickNoslopVerdict({ overridden: false, repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', summary: { found: true, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }, recorded: 0, findings: { read: false, error: 'kettle store locked' }, headNow: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' })).toStrictEqual({ pass: false, reason: "could not read noslop's findings, so no pass: kettle store locked" });
});

test('it blocks open findings, naming them', () => {
  expect(pickNoslopVerdict({ overridden: false, repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', summary: { found: true, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }, recorded: 0, findings: { read: true, open: ['aaaa', 'bbbb'], listed: 2 }, headNow: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' })).toStrictEqual({ pass: false, reason: '2 noslop findings are open: aaaa, bbbb' });
});

test('it blocks an empty findings list when the reviews recorded findings', () => {
  expect(pickNoslopVerdict({ overridden: false, repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', summary: { found: true, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }, recorded: 1, findings: { read: true, open: [], listed: 0 }, headNow: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' })).toStrictEqual({ pass: false, reason: "noslop's findings list is empty, but its reviews of this PR recorded 1 finding, so no pass" });
});

test('it blocks when the head moved while the gate ran', () => {
  expect(pickNoslopVerdict({ overridden: false, repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', summary: { found: true, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }, recorded: 0, findings: { read: true, open: [], listed: 0 }, headNow: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed' })).toStrictEqual({ pass: false, reason: "the PR's head moved from a1b2c3d while the gate ran, so no pass: run the gate again" });
});

test('it passes when noslop read the head and no finding is open', () => {
  expect(pickNoslopVerdict({ overridden: false, repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', summary: { found: true, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }, recorded: 1, findings: { read: true, open: [], listed: 1 }, headNow: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' })).toStrictEqual({ pass: true, reason: 'noslop findings: none open; CI green at a1b2c3d' });
});

test('it passes open findings under an override at the head, naming them', () => {
  expect(pickNoslopVerdict({ overridden: true, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', override: { seq: 3, at: '2026-10-14T01:00:00Z', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-1', note: 'Descale later.', scope: 'open-findings' }, findings: { read: true, open: ['aaaa'], listed: 1 }, headNow: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' })).toStrictEqual({ pass: true, reason: "The owner's override at a1b2c3d (chat:kettle-1) stands for 1 open finding: aaaa" });
});

test('it passes an override at the head when the findings could not be read', () => {
  expect(pickNoslopVerdict({ overridden: true, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', override: { seq: 3, at: '2026-10-14T01:00:00Z', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-1', note: 'Descale later.', scope: 'open-findings' }, findings: { read: false, error: 'kettle store locked' }, headNow: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' })).toStrictEqual({ pass: true, reason: "The owner's override at a1b2c3d (chat:kettle-1) stands; CI green at a1b2c3d" });
});

test('it blocks an override at the head when the head moved while the gate ran', () => {
  expect(pickNoslopVerdict({ overridden: true, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', override: { seq: 3, at: '2026-10-14T01:00:00Z', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-1', note: 'Descale later.', scope: 'open-findings' }, findings: { read: true, open: ['aaaa'], listed: 1 }, headNow: null })).toStrictEqual({ pass: false, reason: "the PR's head moved from a1b2c3d while the gate ran, so no pass: run the gate again" });
});

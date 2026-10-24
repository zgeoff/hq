import { expect, test } from 'bun:test';
import { pickNoslopVerdict } from './pick-noslop-verdict.ts';

test('it blocks a PR noslop has not reviewed, naming the command to review it', () => {
  expect(pickNoslopVerdict({ reviewed: false, repo: 'widgets', pr: 7, unpostedHead: null })).toStrictEqual({ pass: false, reason: 'noslop has no completed review of this PR, so no pass: hq review widgets 7' });
});

test('it blocks when the findings could not be read, with the cause', () => {
  expect(pickNoslopVerdict({ reviewed: true, repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', reviewedHead: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', recorded: 0, unpostedHead: null, findings: { read: false, error: 'kettle store locked' }, override: null, headNow: null })).toStrictEqual({ pass: false, reason: "could not read noslop's findings, so no pass: kettle store locked" });
});

test('it blocks open findings with no override, naming them', () => {
  expect(pickNoslopVerdict({ reviewed: true, repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', reviewedHead: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', recorded: 0, unpostedHead: null, findings: { read: true, open: ['aaaa', 'bbbb'], listed: 2 }, override: null, headNow: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' })).toStrictEqual({ pass: false, reason: '2 noslop findings are open: aaaa, bbbb' });
});

test('it blocks when the head moved while the gate ran, even with no open finding', () => {
  expect(pickNoslopVerdict({ reviewed: true, repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', reviewedHead: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', recorded: 0, unpostedHead: null, findings: { read: true, open: [], listed: 0 }, override: null, headNow: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed' })).toStrictEqual({ pass: false, reason: "the PR's head moved from a1b2c3d while the gate ran, so no pass: run the gate again" });
});

test('it blocks when the head moved under an override', () => {
  expect(pickNoslopVerdict({ reviewed: true, repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', reviewedHead: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', recorded: 0, unpostedHead: null, findings: { read: true, open: ['aaaa'], listed: 1 }, override: { seq: 3, at: '2026-10-14T01:00:00Z', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-1', note: 'Descale later.', scope: 'open-findings' }, headNow: null })).toStrictEqual({ pass: false, reason: "the PR's head moved from a1b2c3d while the gate ran, so no pass: run the gate again" });
});

test('it passes open findings under the owner override, naming them', () => {
  expect(pickNoslopVerdict({ reviewed: true, repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', reviewedHead: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', recorded: 0, unpostedHead: null, findings: { read: true, open: ['aaaa'], listed: 1 }, override: { seq: 3, at: '2026-10-14T01:00:00Z', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-1', note: 'Descale later.', scope: 'open-findings' }, headNow: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' })).toStrictEqual({ pass: true, reason: "The owner's override at a1b2c3d (chat:kettle-1) stands for 1 open finding: aaaa" });
});

test('it passes a reviewed PR with no open finding at a head that did not move', () => {
  expect(pickNoslopVerdict({ reviewed: true, repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', reviewedHead: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', recorded: 0, unpostedHead: null, findings: { read: true, open: [], listed: 0 }, override: { seq: 3, at: '2026-10-14T01:00:00Z', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-1', note: 'Descale later.', scope: 'open-findings' }, headNow: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' })).toStrictEqual({ pass: true, reason: 'noslop findings: none open; CI green at a1b2c3d' });
});

test('it blocks a head that no review that counts has read, naming the command to review it', () => {
  expect(pickNoslopVerdict({ reviewed: true, repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', reviewedHead: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed', recorded: 0, unpostedHead: null, findings: { read: true, open: [], listed: 1 }, override: null, headNow: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' })).toStrictEqual({ pass: false, reason: 'noslop has not reviewed head a1b2c3d; run hq review widgets 7' });
});

test("it blocks an empty findings list when the PR's reviews recorded one finding", () => {
  expect(pickNoslopVerdict({ reviewed: true, repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', reviewedHead: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', recorded: 1, unpostedHead: null, findings: { read: true, open: [], listed: 0 }, override: null, headNow: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' })).toStrictEqual({ pass: false, reason: "noslop's findings list is empty, but its reviews of this PR recorded 1 finding, so no pass" });
});

test('it blocks a PR whose only review of the head was not posted to GitHub, naming the head', () => {
  expect(pickNoslopVerdict({ reviewed: false, repo: 'widgets', pr: 7, unpostedHead: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' })).toStrictEqual({ pass: false, reason: "noslop's review at a1b2c3d was not posted to GitHub; run hq review again" });
});

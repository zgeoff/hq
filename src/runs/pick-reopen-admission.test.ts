import { expect, test } from 'bun:test';
import { pickReopenAdmission } from './pick-reopen-admission.ts';

test('it refuses to reopen an agent pass while both agent lanes are full', () => {
  expect(pickReopenAdmission({ issue: 'GEO-9871', closed: true, lane: 'agent', asked: null, open: { agent: 2, withGeoff: 0 }, openIssues: { agent: ['GEO-9872', 'GEO-9873'], withGeoff: [] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({
    kind: 'refused',
    code: 'design_full',
    message: 'GEO-9871: all 2 agent design passes are open (GEO-9872, GEO-9873); close one with hq run done first',
    data: { lane: 'agent', open: 2, slots: 2 },
  });
});

test('it reopens an agent pass into its lane while an agent lane is free', () => {
  expect(pickReopenAdmission({ issue: 'GEO-9871', closed: true, lane: 'agent', asked: null, open: { agent: 1, withGeoff: 0 }, openIssues: { agent: ['GEO-9872'], withGeoff: [] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({ kind: 'reopen', designLane: 'agent' });
});

test('it refuses to reopen a with-geoff pass above its lane count without --asked', () => {
  expect(pickReopenAdmission({ issue: 'GEO-9874', closed: true, lane: 'with-geoff', asked: null, open: { agent: 0, withGeoff: 1 }, openIssues: { agent: [], withGeoff: ['GEO-9875'] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({
    kind: 'refused',
    code: 'design_full',
    message: 'GEO-9874: the with-geoff design lane is full at 1 (GEO-9875); pass --asked <where the owner asked> to add it above the count',
    data: { lane: 'with-geoff', open: 1, slots: 1 },
  });
});

test('it reopens a with-geoff pass above its lane count with --asked', () => {
  expect(pickReopenAdmission({ issue: 'GEO-9874', closed: true, lane: 'with-geoff', asked: 'chat 30 Oct', open: { agent: 0, withGeoff: 1 }, openIssues: { agent: [], withGeoff: ['GEO-9875'] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({ kind: 'reopen', designLane: 'with-geoff' });
});

test('it refuses to reopen a design pass while pacing.json gives no design counts', () => {
  expect(pickReopenAdmission({ issue: 'GEO-9871', closed: true, lane: 'agent', asked: null, open: { agent: 0, withGeoff: 0 }, openIssues: { agent: [], withGeoff: [] }, slots: { agent: 2, withGeoff: 1 }, designError: 'pacing.json has no design block' })).toStrictEqual({
    kind: 'refused',
    code: 'no_lanes',
    message: 'pacing.json has no design block; hq adds no design pass until pacing.json gives its counts',
  });
});

test('it refuses --asked on reopening a delivery run', () => {
  expect(pickReopenAdmission({ issue: 'GEO-9876', closed: true, lane: null, asked: 'chat 30 Oct', open: { agent: 0, withGeoff: 0 }, openIssues: { agent: [], withGeoff: [] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({
    kind: 'refused',
    code: 'bad_args',
    message: '--asked goes with reopening a with-geoff design pass, and GEO-9876 is a delivery run',
  });
});

test('it reopens a delivery run while the agent design lanes are full', () => {
  expect(pickReopenAdmission({ issue: 'GEO-9876', closed: true, lane: null, asked: null, open: { agent: 2, withGeoff: 0 }, openIssues: { agent: ['GEO-9872', 'GEO-9873'], withGeoff: [] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({ kind: 'reopen', designLane: null });
});

test('it checks no lane count for a design pass that is still open', () => {
  expect(pickReopenAdmission({ issue: 'GEO-9872', closed: false, lane: 'agent', asked: null, open: { agent: 2, withGeoff: 0 }, openIssues: { agent: ['GEO-9872', 'GEO-9873'], withGeoff: [] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({ kind: 'reopen', designLane: null });
});

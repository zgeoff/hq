import { expect, test } from 'bun:test';
import { pickRunAdmission } from './pick-run-admission.ts';

test('it adds a delivery run for an issue that is not Design type and has no --design flag', () => {
  expect(pickRunAdmission({ issue: 'GEO-9801', prior: null, isDesignType: false, design: null, asked: null, open: { agent: 0, withGeoff: 0 }, openIssues: { agent: [], withGeoff: [] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({ kind: 'add', designLane: null });
});

test('it fills the with-geoff lane for a Design-type issue with no --design flag', () => {
  expect(pickRunAdmission({ issue: 'GEO-9801', prior: null, isDesignType: true, design: null, asked: null, open: { agent: 0, withGeoff: 0 }, openIssues: { agent: [], withGeoff: [] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({ kind: 'add', designLane: 'with-geoff' });
});

test('it takes the --design flag over the issue type', () => {
  expect(pickRunAdmission({ issue: 'GEO-9801', prior: null, isDesignType: true, design: 'agent', asked: null, open: { agent: 0, withGeoff: 0 }, openIssues: { agent: [], withGeoff: [] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({ kind: 'add', designLane: 'agent' });
});

test('it refuses a with-geoff pass above its lane count without --asked', () => {
  expect(pickRunAdmission({ issue: 'GEO-9805', prior: null, isDesignType: false, design: 'with-geoff', asked: null, open: { agent: 0, withGeoff: 1 }, openIssues: { agent: [], withGeoff: ['GEO-9804'] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({ kind: 'refused', code: 'design_full', message: 'GEO-9805: the with-geoff design lane is full at 1 (GEO-9804); pass --asked <where the owner asked> to add it above the count', data: { lane: 'with-geoff', open: 1, slots: 1 } });
});

test('it adds a with-geoff pass above its lane count with --asked', () => {
  expect(pickRunAdmission({ issue: 'GEO-9805', prior: null, isDesignType: false, design: 'with-geoff', asked: 'chat 29 Oct', open: { agent: 0, withGeoff: 1 }, openIssues: { agent: [], withGeoff: ['GEO-9804'] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({ kind: 'add', designLane: 'with-geoff' });
});

test('it refuses a Design-type issue with no --design flag above the with-geoff count', () => {
  expect(pickRunAdmission({ issue: 'GEO-9806', prior: null, isDesignType: true, design: null, asked: null, open: { agent: 0, withGeoff: 1 }, openIssues: { agent: [], withGeoff: ['GEO-9804'] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({ kind: 'refused', code: 'design_full', message: 'GEO-9806: the with-geoff design lane is full at 1 (GEO-9804); pass --asked <where the owner asked> to add it above the count', data: { lane: 'with-geoff', open: 1, slots: 1 } });
});

test('it refuses an agent pass above the agent count', () => {
  expect(pickRunAdmission({ issue: 'GEO-9808', prior: null, isDesignType: false, design: 'agent', asked: null, open: { agent: 2, withGeoff: 0 }, openIssues: { agent: ['GEO-9806', 'GEO-9807'], withGeoff: [] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({ kind: 'refused', code: 'design_full', message: 'GEO-9808: all 2 agent design passes are open (GEO-9806, GEO-9807); close one with hq run done first', data: { lane: 'agent', open: 2, slots: 2 } });
});

test('it refuses --asked on an agent pass', () => {
  expect(pickRunAdmission({ issue: 'GEO-9801', prior: null, isDesignType: false, design: 'agent', asked: 'chat 29 Oct', open: { agent: 0, withGeoff: 0 }, openIssues: { agent: [], withGeoff: [] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({ kind: 'refused', code: 'bad_args', message: '--asked goes with a with-geoff design pass, not an agent one' });
});

test('it refuses --asked on a delivery run', () => {
  expect(pickRunAdmission({ issue: 'GEO-9809', prior: null, isDesignType: false, design: null, asked: 'chat 29 Oct', open: { agent: 0, withGeoff: 0 }, openIssues: { agent: [], withGeoff: [] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({ kind: 'refused', code: 'bad_args', message: '--asked goes with a with-geoff design pass, and GEO-9809 gets a delivery run: pass --design with-geoff for a design pass' });
});

test('it adds a delivery run while the agent design lanes are full', () => {
  expect(pickRunAdmission({ issue: 'GEO-9801', prior: null, isDesignType: false, design: null, asked: null, open: { agent: 2, withGeoff: 1 }, openIssues: { agent: ['GEO-9806', 'GEO-9807'], withGeoff: ['GEO-9804'] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({ kind: 'add', designLane: null });
});

test('it refuses a design pass while the design counts in pacing.json have an error', () => {
  expect(pickRunAdmission({ issue: 'GEO-9801', prior: null, isDesignType: false, design: 'agent', asked: null, open: { agent: 0, withGeoff: 0 }, openIssues: { agent: [], withGeoff: [] }, slots: { agent: 2, withGeoff: 1 }, designError: 'pacing.json: agentDesignSlots is wrong' })).toStrictEqual({ kind: 'refused', code: 'no_lanes', message: 'pacing.json: agentDesignSlots is wrong; hq adds no design pass until pacing.json gives its counts' });
});

test('it refuses a Design-type issue with no --design flag while the design counts in pacing.json have an error', () => {
  expect(pickRunAdmission({ issue: 'GEO-9801', prior: null, isDesignType: true, design: null, asked: null, open: { agent: 0, withGeoff: 0 }, openIssues: { agent: [], withGeoff: [] }, slots: { agent: 2, withGeoff: 1 }, designError: 'pacing.json: designSlots is wrong' })).toStrictEqual({ kind: 'refused', code: 'no_lanes', message: 'pacing.json: designSlots is wrong; hq adds no design pass until pacing.json gives its counts' });
});

test('it adds a delivery run while the design counts in pacing.json have an error', () => {
  expect(pickRunAdmission({ issue: 'GEO-9801', prior: null, isDesignType: false, design: null, asked: null, open: { agent: 0, withGeoff: 0 }, openIssues: { agent: [], withGeoff: [] }, slots: { agent: 2, withGeoff: 1 }, designError: 'pacing.json: designSlots is wrong' })).toStrictEqual({ kind: 'add', designLane: null });
});

test('it turns a closed design pass into the build run', () => {
  expect(pickRunAdmission({ issue: 'GEO-9811', prior: { state: 'done', designLane: 'agent' }, isDesignType: false, design: null, asked: null, open: { agent: 0, withGeoff: 0 }, openIssues: { agent: [], withGeoff: [] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({ kind: 'move', designLane: 'agent', from: 'done' });
});

test('it refuses --design on a closed design run, since a new pass needs a reopen', () => {
  expect(pickRunAdmission({ issue: 'GEO-9812', prior: { state: 'done', designLane: 'agent' }, isDesignType: false, design: 'agent', asked: null, open: { agent: 0, withGeoff: 0 }, openIssues: { agent: [], withGeoff: [] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({ kind: 'refused', code: 'bad_state', message: 'GEO-9812: its agent design pass is done; a new design pass needs hq run reopen GEO-9812' });
});

test('it refuses --asked on the move from a closed design pass to the build run', () => {
  expect(pickRunAdmission({ issue: 'GEO-9812', prior: { state: 'dropped', designLane: 'with-geoff' }, isDesignType: false, design: null, asked: 'chat 29 Oct', open: { agent: 0, withGeoff: 0 }, openIssues: { agent: [], withGeoff: [] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({ kind: 'refused', code: 'bad_args', message: "--asked goes with a new with-geoff design pass; hq run add without --design turns GEO-9812's dropped design pass into the build run" });
});

test('it refuses a closed run with no design lane until a reopen', () => {
  expect(pickRunAdmission({ issue: 'GEO-9813', prior: { state: 'done', designLane: null }, isDesignType: true, design: null, asked: null, open: { agent: 0, withGeoff: 0 }, openIssues: { agent: [], withGeoff: [] }, slots: { agent: 2, withGeoff: 1 }, designError: null })).toStrictEqual({ kind: 'refused', code: 'bad_state', message: 'GEO-9813 is done: hq run reopen GEO-9813' });
});

import { expect, test } from 'bun:test';
import { decideCapChange } from './decide-cap-change.ts';

test('it lets the owner raise a cap', () => {
  const decision = decideCapChange({ caller: { kind: 'owner', by: 'z-stu' }, current: { cap: 7, until: '2026-10-19T21:00:00Z', reason: 'weekend pacing', by: 'z-stu', at: '2026-10-15T00:00:00Z' }, request: { kind: 'set', cap: 9, until: null, reason: null }, at: '2026-10-16T00:00:00Z' });

  expect(decision).toStrictEqual({ ok: true, action: 'cap-set', cap: { cap: 9, until: null, reason: null, by: 'z-stu', at: '2026-10-16T00:00:00Z' }, reason: null, by: 'z-stu' });
});

test('it lets the owner lift a cap', () => {
  const decision = decideCapChange({ caller: { kind: 'owner', by: 'z-stu' }, current: { cap: 7, until: '2026-10-19T21:00:00Z', reason: 'weekend pacing', by: 'z-stu', at: '2026-10-15T00:00:00Z' }, request: { kind: 'off', reason: 'the kettle is back' }, at: '2026-10-16T00:00:00Z' });

  expect(decision).toStrictEqual({ ok: true, action: 'cap-off', cap: { cap: 7, until: '2026-10-19T21:00:00Z', reason: 'weekend pacing', by: 'z-stu', at: '2026-10-15T00:00:00Z' }, reason: 'the kettle is back', by: 'z-stu' });
});

test('it lets the delivery lead set a cap where none exists', () => {
  const decision = decideCapChange({ caller: { kind: 'delivery', by: 'z-delivery' }, current: null, request: { kind: 'set', cap: 4, until: null, reason: 'quota' }, at: '2026-10-16T00:00:00Z' });

  expect(decision).toStrictEqual({ ok: true, action: 'cap-set', cap: { cap: 4, until: null, reason: 'quota', by: 'z-delivery', at: '2026-10-16T00:00:00Z' }, reason: 'quota', by: 'z-delivery' });
});

test('it lets the delivery lead lower a cap and keeps the until and reason it does not replace', () => {
  const decision = decideCapChange({ caller: { kind: 'delivery', by: 'z-delivery' }, current: { cap: 7, until: '2026-10-19T21:00:00Z', reason: 'weekend pacing', by: 'z-stu', at: '2026-10-15T00:00:00Z' }, request: { kind: 'set', cap: 5, until: null, reason: null }, at: '2026-10-16T00:00:00Z' });

  expect(decision).toStrictEqual({ ok: true, action: 'cap-set', cap: { cap: 5, until: '2026-10-19T21:00:00Z', reason: 'weekend pacing', by: 'z-delivery', at: '2026-10-16T00:00:00Z' }, reason: 'weekend pacing', by: 'z-delivery' });
});

test('it lets the delivery lead replace the until and reason when lowering', () => {
  const decision = decideCapChange({ caller: { kind: 'delivery', by: 'z-delivery' }, current: { cap: 7, until: '2026-10-19T21:00:00Z', reason: 'weekend pacing', by: 'z-stu', at: '2026-10-15T00:00:00Z' }, request: { kind: 'set', cap: 5, until: '2026-10-17T00:00:00Z', reason: 'quota' }, at: '2026-10-16T00:00:00Z' });

  expect(decision).toStrictEqual({ ok: true, action: 'cap-set', cap: { cap: 5, until: '2026-10-17T00:00:00Z', reason: 'quota', by: 'z-delivery', at: '2026-10-16T00:00:00Z' }, reason: 'quota', by: 'z-delivery' });
});

test('it refuses the delivery lead raising a cap', () => {
  const decision = decideCapChange({ caller: { kind: 'delivery', by: 'z-delivery' }, current: { cap: 7, until: '2026-10-19T21:00:00Z', reason: 'weekend pacing', by: 'z-stu', at: '2026-10-15T00:00:00Z' }, request: { kind: 'set', cap: 9, until: null, reason: null }, at: '2026-10-16T00:00:00Z' });

  expect(decision).toStrictEqual({ ok: false, message: 'z-delivery may only lower the lanes cap (now 7), not raise or keep it; z-stu may' });
});

test('it refuses the delivery lead keeping a cap at the same count', () => {
  const decision = decideCapChange({ caller: { kind: 'delivery', by: 'z-delivery' }, current: { cap: 7, until: '2026-10-19T21:00:00Z', reason: 'weekend pacing', by: 'z-stu', at: '2026-10-15T00:00:00Z' }, request: { kind: 'set', cap: 7, until: null, reason: null }, at: '2026-10-16T00:00:00Z' });

  expect(decision).toStrictEqual({ ok: false, message: 'z-delivery may only lower the lanes cap (now 7), not raise or keep it; z-stu may' });
});

test('it refuses the delivery lead lifting a cap', () => {
  const decision = decideCapChange({ caller: { kind: 'delivery', by: 'z-delivery' }, current: { cap: 7, until: '2026-10-19T21:00:00Z', reason: 'weekend pacing', by: 'z-stu', at: '2026-10-15T00:00:00Z' }, request: { kind: 'off', reason: null }, at: '2026-10-16T00:00:00Z' });

  expect(decision).toStrictEqual({ ok: false, message: 'z-delivery may set a lanes cap or lower it, not lift it; z-stu may' });
});

test('it refuses a caller that is neither, naming who may change the cap', () => {
  const decision = decideCapChange({ caller: { kind: 'other' }, current: null, request: { kind: 'set', cap: 4, until: null, reason: null }, at: '2026-10-16T00:00:00Z' });

  expect(decision).toStrictEqual({ ok: false, message: 'only z-stu may change the lanes cap, and z-delivery may set one or lower it; atc does not know this caller as either' });
});

test('it refuses a caller atc could not identify', () => {
  const decision = decideCapChange({ caller: { kind: 'unknown', cause: 'connect ENOENT' }, current: null, request: { kind: 'set', cap: 4, until: null, reason: null }, at: '2026-10-16T00:00:00Z' });

  expect(decision).toStrictEqual({ ok: false, message: 'atc could not say who is asking, so the lanes cap stays as it is: connect ENOENT' });
});

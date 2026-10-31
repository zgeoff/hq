import { expect, test } from 'bun:test';
import { pickHealthMoves } from './pick-health-moves.ts';

test('#pickHealthMoves reports a new problem no session owns, and asks the owner of an owned one', () => {
  const checks = [
    { key: 'disk', ok: false, line: 'disk /: 2.0 GiB free' },
    { key: 'state-size:kettle.md', ok: false, line: 'state file kettle.md is 20.0 KB', owner: { session: 'z-kettle', ask: 'trim it' } },
  ];

  expect(pickHealthMoves({}, checks, [], '2026-10-14T01:00:00Z')).toStrictEqual([
    { action: 'reported', key: 'disk', line: 'disk /: 2.0 GiB free' },
    { action: 'asked', key: 'state-size:kettle.md', line: 'state file kettle.md is 20.0 KB', owner: { session: 'z-kettle', ask: 'trim it' } },
  ]);
});

test('#pickHealthMoves escalates an asked problem at 2 hours, not a minute before', () => {
  const open = { 'state-size:kettle.md': { since: '2026-10-14T01:00:00Z', line: 'state file kettle.md is 20.0 KB', asked: 'z-kettle' } };
  const checks = [{ key: 'state-size:kettle.md', ok: false, line: 'state file kettle.md is 20.0 KB' }];

  expect([pickHealthMoves(open, checks, [], '2026-10-14T02:59:00Z'), pickHealthMoves(open, checks, [], '2026-10-14T03:00:00Z')]).toStrictEqual([
    [],
    [{ action: 'escalated', key: 'state-size:kettle.md', line: 'state file kettle.md is 20.0 KB', asked: 'z-kettle', since: '2026-10-14T01:00:00Z' }],
  ]);
});

test('#pickHealthMoves leaves an escalated problem and a problem with no asked session where they are', () => {
  const open = {
    'state-size:kettle.md': { since: '2026-10-13T01:00:00Z', line: 'state file kettle.md is 20.0 KB', asked: 'z-kettle', escalated: true },
    'state-size:teapot.md': { since: '2026-10-13T01:00:00Z', line: 'state file teapot.md is 20.0 KB' },
  };
  const checks = [
    { key: 'state-size:kettle.md', ok: false, line: 'state file kettle.md is 20.0 KB' },
    { key: 'state-size:teapot.md', ok: false, line: 'state file teapot.md is 20.0 KB' },
  ];

  expect(pickHealthMoves(open, checks, [], '2026-10-14T01:00:00Z')).toStrictEqual([]);
});

test('#pickHealthMoves clears a problem whose check passes, but not one whose read was unknown', () => {
  const open = {
    disk: { since: '2026-10-14T00:00:00Z', line: 'disk /: 2.0 GiB free' },
    'state-size:kettle.md': { since: '2026-10-14T00:00:00Z', line: 'state file kettle.md is 20.0 KB', asked: 'z-kettle' },
  };

  expect(pickHealthMoves(open, [], ['state-size'], '2026-10-14T01:00:00Z')).toStrictEqual([{ action: 'cleared', key: 'disk', line: 'disk /: 2.0 GiB free', since: '2026-10-14T00:00:00Z' }]);
});

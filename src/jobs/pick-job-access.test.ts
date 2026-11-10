import { expect, test } from 'bun:test';
import { pickJobAccess } from './pick-job-access.ts';
import type { JobCaller } from './pick-job-access.ts';

test.each([
  { title: 'the target itself', caller: { kind: 'named', name: 'z-release' } satisfies JobCaller },
  { title: 'the owner', caller: { kind: 'named', name: 'z-stu' } satisfies JobCaller },
])('it allows $title', ({ caller }) => {
  expect(pickJobAccess({ caller, target: 'z-release', owner: 'z-stu' })).toStrictEqual({ allowed: true });
});

test.each([
  { title: 'another role', caller: { kind: 'named', name: 'z-triage' } satisfies JobCaller, reason: /z-triage may not change the jobs of z-release/ },
  { title: 'a caller in no fleet session', caller: { kind: 'unnamed' } satisfies JobCaller, reason: /no fleet session/ },
  { title: 'a caller atc could not identify', caller: { kind: 'unknown', cause: 'atc is down' } satisfies JobCaller, reason: /atc is down/ },
])('it refuses $title', ({ caller, reason }) => {
  expect(pickJobAccess({ caller, target: 'z-release', owner: 'z-stu' })).toStrictEqual({ allowed: false, reason: expect.stringMatching(reason) });
});

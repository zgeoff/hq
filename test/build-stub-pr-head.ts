import { FAKE_BASE_SHA, FAKE_PROOF_BODY } from './noslop-fake.ts';
import type { FakeScript } from './noslop-fake.ts';

interface StubAuthor {
  login: string;
  is_bot: boolean;
}

// The two gh answers that name a PR's head, for a fake runner on a real repo: the gate facts (one
// passing check, a human author, a body, with the skill proof by default) and the bare head read.
export function buildStubPRHead(head: string, author?: StubAuthor, body: string = FAKE_PROOF_BODY): Pick<FakeScript, 'prFacts' | 'prHead'> {
  return {
    prFacts: { code: 0, stdout: JSON.stringify({ headRefOid: head, baseRefName: 'main', baseRefOid: FAKE_BASE_SHA, author: author ?? { login: 'zgeoff', is_bot: false }, body, statusCheckRollup: [{ __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }] }), stderr: '' },
    prHead: { code: 0, stdout: JSON.stringify({ headRefOid: head }), stderr: '' },
  };
}

import { FAKE_BASE_SHA, FAKE_PROOF_BODY } from './noslop-fake.ts';
import type { FakeScript } from './noslop-fake.ts';

interface StubAuthor {
  login: string;
  is_bot: boolean;
}

export function buildStubPRHead(head: string, author?: StubAuthor, body: string = FAKE_PROOF_BODY): Pick<FakeScript, 'prFacts' | 'prHead'> {
  return {
    prFacts: { code: 0, stdout: JSON.stringify({ headRefOid: head, headRefName: 'feat', isCrossRepository: false, baseRefName: 'main', baseRefOid: FAKE_BASE_SHA, author: author ?? { login: 'zgeoff', is_bot: false }, body, statusCheckRollup: [{ __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }] }), stderr: '' },
    prHead: { code: 0, stdout: JSON.stringify({ headRefOid: head }), stderr: '' },
  };
}

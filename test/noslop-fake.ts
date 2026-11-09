import { realRunner } from '../src/runner/real-runner.ts';
import { findPath } from '../src/test-utils/find-path.ts';
import type { RunOpts, RunResult, Runner } from '../src/runner/types.ts';

interface FakeCall {
  cmd: string[];
  opts: RunOpts | undefined;
}

export interface FakeScript {
  secrets?: Record<string, string>;
  opAnswer?: RunResult;
  noslopReview?: RunResult;
  noslopHelp?: RunResult;

  runStoreQuery?: () => RunResult;

  pgrep?: RunResult;
  author?: string;
  prBody?: string;
  prHeadBranch?: string;

  prHead?: RunResult;

  prFacts?: RunResult;

  workflows?: RunResult;
  baseWorkflows?: RunResult;

  contents?: Record<string, RunResult>;

  baseCommit?: RunResult;

  prFiles?: RunResult;

  noslopFindings?: RunResult;

  noslopCheck?: RunResult;

  reviewComments?: RunResult;

  issueComments?: RunResult;

  ghPost?: RunResult;

  markerComments?: RunResult;

  noslopChecks?: RunResult;

  prRefs?: RunResult;

  prShas?: RunResult;

  patchIds?: Record<string, string>;

  realGit?: boolean;

  origin?: string;
}

export interface FakeRunner {
  run: Runner;
  calls: FakeCall[];

  lines: () => string[];

  of: (program: string) => FakeCall[];
}

export const FAKE_FULL_SHA = '0123456789abcdef0123456789abcdef01234567';
export const FAKE_BASE_SHA = 'ba5eba5eba5eba5eba5eba5eba5eba5eba5eba5e';

export const FAKE_PROOF_BODY = ['Teach the kettle skill to pour.', '## Checks', '- [x] chex prose, links and skill: cleared', '- [x] Cold read: 2 fixed, 0 declined', '- [x] Deslop: 1 edit', '', 'Declined: none.'].join('\n');
const NOT_FOUND: RunResult = { code: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' };

export const FAKE_REVIEW_JSON = JSON.stringify({
    version: 4,
    reviewID: 'r1',
    repo: 'zgeoff/widgets',
    pullRequest: 7,
    base: 'main',
    head: 'feat',
    depth: 'standard',
    findings: [{ id: '00112233445566aa', lens: 'correctness', severity: 'high', title: 'Kettle never boils' }],
    failedCalls: [],
});

export const FAKE_SECRETS: Record<string, string> = {
  'app-id': 'app-4711',
  'installation-id': 'inst-8842',
  'private-key': '-----BEGIN KEY-----\nbadger-secret-key\n-----END KEY-----',
};

export const FAKE_TOKEN = 'ops_kettle-token-0042';

function buildResult(stdout: string, code = 0, stderr = ''): RunResult {
  return { code, stdout, stderr };
}

function pickOpAnswer(script: FakeScript): RunResult {
  const secrets = script.secrets ?? FAKE_SECRETS;
  return script.opAnswer ?? buildResult(JSON.stringify(Object.entries(secrets).map(([label, value]) => ({ id: label, type: 'CONCEALED', label, value }))));
}

function pickBunAnswer(script: FakeScript, cmd: string[]): RunResult {
  if (cmd[3] === 'findings') {
    return script.noslopFindings ?? buildResult(JSON.stringify({ findings: [] }));
  }
  if (cmd[3] === 'check') {
    return script.noslopCheck ?? buildResult(JSON.stringify({ conclusion: 'success', title: 'No findings need attention.', summary: '', open: [] }));
  }
  if (cmd[3] === 'store') {
    return script.runStoreQuery?.() ?? buildResult('[]');
  }
  if (cmd[4] === '--help') {
    return script.noslopHelp ?? buildResult('  --pr <pr>   Review a pull request\n');
  }
  return script.noslopReview ?? buildResult(FAKE_REVIEW_JSON);
}

// oxlint-disable-next-line zgeoff/module-order -- grandfathered: helpers sit above the factory
function pickGhAnswer(script: FakeScript, line: string): RunResult | null {
  if (line.endsWith('--json headRefOid,baseRefOid')) {
    return script.prShas ?? buildResult(JSON.stringify({ headRefOid: FAKE_FULL_SHA, baseRefOid: FAKE_BASE_SHA }));
  }
  if (line.endsWith('--json headRefOid,baseRefName')) {
    return script.prRefs ?? buildResult(JSON.stringify({ headRefOid: FAKE_FULL_SHA, baseRefName: 'main' }));
  }
  if (line.includes('--json headRefName,baseRefName')) {
    return buildResult(JSON.stringify({ headRefName: 'feat', baseRefName: 'main', body: script.prBody ?? '' }));
  }
  if (line.endsWith('--json baseRefName')) {
    return buildResult(JSON.stringify({ baseRefName: 'main' }));
  }
  if (line.includes('--json headRefName,headRefOid,baseRefName')) {
    return buildResult(JSON.stringify({ headRefName: 'feat', headRefOid: FAKE_FULL_SHA, baseRefName: 'main' }));
  }
  if (line.includes('--json headRefOid,author,statusCheckRollup')) {
    const author = findPath(JSON.parse(script.author ?? '{"author":{"login":"zgeoff","is_bot":false}}'), 'author');
    return script.prFacts ?? buildResult(JSON.stringify({ headRefOid: FAKE_FULL_SHA, headRefName: script.prHeadBranch ?? 'feat', baseRefName: 'main', baseRefOid: FAKE_BASE_SHA, author, body: script.prBody ?? '', statusCheckRollup: [{ __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }] }));
  }
  if (line.includes('--json headRefOid')) {
    return script.prHead ?? buildResult(JSON.stringify({ headRefOid: FAKE_FULL_SHA }));
  }
  if (line.includes('--json author')) {
    return buildResult(script.author ?? '{"author":{"login":"zgeoff","is_bot":false}}');
  }
  if (line.includes('--json name,state,bucket')) {
    return buildResult('[{"name":"test","state":"SUCCESS","bucket":"pass"}]');
  }
  if (line.startsWith('gh api repos/') && line.includes('/contents/.github/workflows?ref=')) {
    return (line.includes('?ref=main ') ? script.baseWorkflows : undefined) ?? script.workflows ?? buildResult('');
  }
  if (line.startsWith('gh api repos/') && line.includes('/contents/') && !line.includes('/contents/.github/workflows')) {
    return script.contents?.[line.replace(/^gh api repos\/[^/]+\/[^/]+\/contents\//u, '')] ?? NOT_FOUND;
  }
  if (line.startsWith('gh api --paginate repos/') && line.includes('/files?')) {
    return script.prFiles ?? buildResult('src/kettle.ts\n');
  }
  if (line.startsWith('gh api -X POST repos/')) {
    return script.ghPost ?? buildResult('https://github.com/zgeoff/widgets/pull/7#discussion_r9000\n');
  }
  if (line.startsWith('gh api repos/') && line.includes('/comments --paginate') && line.includes('.user.type')) {
    return (line.includes('/pulls/') ? script.reviewComments : script.issueComments) ?? buildResult('');
  }
  if (line.startsWith('gh api repos/') && line.includes('/issues/') && line.includes('/comments --paginate') && line.includes('user.login')) {
    return script.markerComments ?? buildResult(`${JSON.stringify({ login: 'noslop-review[bot]', body: `<!-- noslop:summary {"head":"${FAKE_FULL_SHA}","reviews":1} -->`, updatedAt: '2026-10-14T01:00:00Z' })}\n`);
  }
  if (line.startsWith('gh api repos/') && line.includes('/check-runs?check_name=noslop')) {
    return script.noslopChecks ?? buildResult(`${JSON.stringify({ id: 9001, name: 'noslop', app: 'noslop-review', status: 'completed', conclusion: 'success', title: 'No findings need attention.', completedAt: '2026-10-14T01:00:05Z' })}\n`);
  }
  if (/^gh api repos\/[^/]+\/[^/]+\/commits\/[0-9a-f]+ --silent$/u.test(line)) {
    return script.baseCommit ?? buildResult('');
  }
  if (line.startsWith('gh api graphql')) {
    return buildResult('1\n');
  }
  return null;
}

// oxlint-disable-next-line zgeoff/module-order -- grandfathered: helpers sit above the factory
function pickAnswer(script: FakeScript, cmd: string[], opts: RunOpts | undefined): RunResult {
  const line = cmd.join(' ');
  const patch = pickPatchAnswer(script, cmd, opts);
  if (patch !== null) {
    return patch;
  }
  if (cmd[0] === 'op') {
    return pickOpAnswer(script);
  }
  if (cmd[0] === 'pgrep') {
    return script.pgrep ?? buildResult('', 1);
  }
  if (cmd[0] === 'bun') {
    return pickBunAnswer(script, cmd);
  }
  if (line === 'git remote get-url origin') {
    return buildResult(`git@github.com:zgeoff/${script.origin ?? 'widgets'}.git\n`);
  }
  if (line === 'git rev-parse HEAD' || line === 'git rev-parse FETCH_HEAD') {
    return buildResult(`${FAKE_FULL_SHA}\n`);
  }
  if (cmd[1] === 'rev-list' && cmd[2] === '--parents') {
    return buildResult(`${cmd[5] ?? ''}\n`);
  }
  if (cmd[1] === 'rev-parse' && cmd[2] === '--verify') {
    return buildResult(`${expandSha((cmd[3] ?? '').replace('^{commit}', ''))}\n`);
  }
  return pickGhAnswer(script, line) ?? buildResult('');
}

function expandSha(short: string): string {
  return FAKE_FULL_SHA.startsWith(short) ? FAKE_FULL_SHA : short.padEnd(40, '0');
}

function pickPatchAnswer(script: FakeScript, cmd: string[], opts: RunOpts | undefined): RunResult | null {
  const patchIds = script.patchIds;
  if (patchIds === undefined || cmd[0] !== 'git') {
    return null;
  }
  if (cmd[1] === 'diff' && cmd[2] === '--binary') {
    return buildResult(`diff of ${cmd.at(-1) ?? ''}\n`);
  }
  if (cmd[1] === 'patch-id') {
    const head = (opts?.stdin ?? '').replace(/^diff of /u, '').trim();
    const id = patchIds[head];
    const printed = id === undefined ? '' : `${id} ${'0'.repeat(40)}\n`;
    return buildResult(printed);
  }
  return null;
}

function isRealGit(script: FakeScript, cmd: string[]): boolean {
  const line = cmd.join(' ');
  return script.realGit === true && cmd[0] === 'git' && line !== 'git remote get-url origin';
}

export function buildFakeRunner(script: FakeScript = {}): FakeRunner {
  const calls: FakeCall[] = [];
  const run: Runner = (cmd, opts) => {
    calls.push({ cmd, opts });
    return isRealGit(script, cmd) ? realRunner(cmd, opts) : Promise.resolve(pickAnswer(script, cmd, opts));
  };
  return { run, calls, lines: () => calls.map((c) => c.cmd.join(' ')), of: (program) => calls.filter((c) => c.cmd[0] === program) };
}

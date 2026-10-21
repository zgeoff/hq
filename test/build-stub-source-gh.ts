import type { RunResult, Runner } from '../src/runner/types.ts';

export interface StubSourceFacts {
  // ref (repo#n) to the PR's merge commit
  shas: Record<string, string>;

  // a release tag or a build commit to the merge commits it holds
  contains: Record<string, string[]>;

  // repo to its release rows, as GitHub lists them
  releases?: Record<string, unknown>;

  // repo to its release-please-config.json
  config?: Record<string, unknown>;

  // ref (repo#n) to the PR's file records: a path, or for a rename `<new path>\t<previous path>`
  files?: Record<string, string[]>;

  // compare heads GitHub does not know, which gh answers with its 404 text
  unknownHeads?: string[];
}

// A fake gh for the release sources: merge commits, compares, the paged release list, the
// release-please config at a commit and a PR's files. A call it does not know fails. Every call's
// line goes into `calls`.
export function buildStubSourceGH(facts: StubSourceFacts, calls: string[]): Runner {
  return (cmd) => {
    const line = cmd.join(' ');
    calls.push(line);
    return Promise.resolve(answer(facts, line));
  };
}

const NOT_FOUND: RunResult = { code: 1, stdout: '', stderr: 'invented 404' };

function answer(facts: StubSourceFacts, line: string): RunResult {
  const view = /^gh pr view (?<number>\d+) -R zgeoff\/(?<repo>[\w-]+) --json mergeCommit$/u.exec(line)?.groups;
  if (view) {
    const sha = facts.shas[`${view['repo']}#${view['number']}`];
    return sha ? buildAnswer(JSON.stringify({ mergeCommit: { oid: sha } })) : NOT_FOUND;
  }
  const files = /^gh api --paginate repos\/zgeoff\/(?<repo>[\w-]+)\/pulls\/(?<number>\d+)\/files\?per_page=100 --jq \.\[\] \| \[\.filename, \.previous_filename \/\/ empty\] \| @tsv$/u.exec(line)?.groups;
  if (files) {
    return buildAnswer((facts.files?.[`${files['repo']}#${files['number']}`] ?? []).map((path) => `${path}\n`).join(''));
  }
  const compare = /^gh api repos\/zgeoff\/[\w-]+\/compare\/(?<sha>[0-9a-f]{40})\.\.\.(?<head>\S+) --jq \.status$/u.exec(line)?.groups;
  if (compare && facts.unknownHeads?.includes(decodeURIComponent(compare['head'] ?? ''))) {
    return { code: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)\n' };
  }
  if (compare) {
    const held = (facts.contains[decodeURIComponent(compare['head'] ?? '')] ?? []).includes(compare['sha'] ?? '');
    const status = held ? 'ahead' : 'behind';
    return buildAnswer(`${status}\n`);
  }
  const paged = /^gh api --paginate --slurp repos\/zgeoff\/(?<repo>[\w-]+)\/releases\?per_page=100$/u.exec(line)?.groups;
  if (paged) {
    const rows = facts.releases?.[paged['repo'] ?? ''];
    return rows ? buildAnswer(JSON.stringify([rows])) : NOT_FOUND;
  }
  const config = /^gh api repos\/zgeoff\/(?<repo>[\w-]+)\/contents\/release-please-config\.json\?ref=[0-9a-f]{40} --jq \.content$/u.exec(line)?.groups;
  if (config) {
    const body = facts.config?.[config['repo'] ?? ''];
    if (body === undefined) {
      return NOT_FOUND;
    }
    const wrapped = Buffer.from(JSON.stringify(body)).toString('base64').replaceAll(/(?<chunk>.{60})/gu, '$<chunk>\n');
    return buildAnswer(`${wrapped}\n`);
  }
  return { code: 1, stdout: '', stderr: `unexpected ${line}` };
}

function buildAnswer(stdout: string): RunResult {
  return { code: 0, stdout, stderr: '' };
}

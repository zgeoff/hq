import type { RunResult, Runner } from '../src/runner/types.ts';

export interface StubBriefFacts {
  commits: Record<string, string>;

  files: Record<string, string>;
}

export function buildStubBriefGH(facts: StubBriefFacts, calls: string[]): Runner {
  return (command) => {
    const line = command.join(' ');
    calls.push(line);
    return Promise.resolve(answer(facts, line));
  };
}

const NOT_FOUND: RunResult = { code: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)\n' };

function answer(facts: StubBriefFacts, line: string): RunResult {
  const commit = /^gh api repos\/zgeoff\/hq\/commits\/(?<ref>\S+) --jq \.sha$/u.exec(line)?.groups;
  if (commit) {
    const sha = facts.commits[commit['ref'] ?? ''];
    return sha === undefined ? NOT_FOUND : { code: 0, stdout: `${sha}\n`, stderr: '' };
  }
  const file = /^gh api repos\/zgeoff\/hq\/contents\/(?<path>\S+)\?ref=(?<sha>[0-9a-f]{40}) -H Accept: application\/vnd\.github\.raw$/u.exec(line)?.groups;
  if (file) {
    const text = Object.values(facts.commits).includes(file['sha'] ?? '') ? facts.files[file['path'] ?? ''] : undefined;
    return text === undefined ? NOT_FOUND : { code: 0, stdout: text, stderr: '' };
  }
  return { code: 1, stdout: '', stderr: `unexpected ${line}` };
}

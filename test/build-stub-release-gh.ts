import type { RunResult, Runner } from '../src/runner/types.ts';

export interface StubReleaseRow {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
}

// A fake gh for the release list a watch reads: `gh api repos/<owner>/<repo>/releases?per_page=30
// --jq ...` answers that repo's rows, newest first as GitHub lists them. A repo it does not hold
// answers gh's 404, and any other command fails. Every call's line goes into `calls`.
export function buildStubReleaseGH(releases: Record<string, StubReleaseRow[]>, calls: string[]): Runner {
  return (cmd) => {
    const line = cmd.join(' ');
    calls.push(line);
    return Promise.resolve(answer(releases, line));
  };
}

const LIST = /^gh api repos\/(?<repo>[\w.-]+\/[\w.-]+)\/releases\?per_page=30 --jq \[\.\[\] \| \{tag_name, draft, prerelease, published_at\}\]$/u;

function answer(releases: Record<string, StubReleaseRow[]>, line: string): RunResult {
  const repo = LIST.exec(line)?.groups?.['repo'];
  if (repo === undefined) {
    return { code: 1, stdout: '', stderr: `unexpected ${line}` };
  }
  const rows = releases[repo];
  return rows === undefined ? { code: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)\n' } : { code: 0, stdout: JSON.stringify(rows), stderr: '' };
}

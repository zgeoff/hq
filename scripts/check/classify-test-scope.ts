export function classifyTestScope(paths: readonly string[]): 'run' | 'skip' {
  if (paths.length === 0) {
    return 'run';
  }
  return paths.every((path) => isDocOrData(path)) ? 'skip' : 'run';
}

const DATA_FILES = new Set(['grants/still-ask.yaml']);

// Read by a test, so a change to it runs the tests: src/goals/sync-goals.test.ts reads repo-facts.md.
const TEST_INPUTS = new Set(['docs/skill-development/repo-facts.md']);

const CODE_FOLDERS = new Set(['scripts', 'testdata', 'fixtures', 'mocks']);

function isDocOrData(path: string): boolean {
  if (DATA_FILES.has(path)) {
    return true;
  }
  if (!path.endsWith('.md') || TEST_INPUTS.has(path) || path.startsWith('.github/')) {
    return false;
  }
  return !path.split('/').some((folder) => CODE_FOLDERS.has(folder));
}

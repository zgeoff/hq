interface StubHunk {
  start: number;
  removed: string[];
  added: string[];
}

export function buildStubFileDiff(path: string, hunk: StubHunk): string {
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, `@@ -${hunk.start},${hunk.removed.length} +${hunk.start},${hunk.added.length} @@`, ...hunk.removed.map((line) => `-${line}`), ...hunk.added.map((line) => `+${line}`), ''].join('\n');
}

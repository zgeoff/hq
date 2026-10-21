import type { PRRef } from '../parse-pr-url.ts';

const PR_CONDITION = /^[\w.-]+\/[\w.-]+#\d+$/u;

export function parsePRCondition(ref: string): PRRef | null {
  if (!PR_CONDITION.test(ref)) {
    return null;
  }
  const slash = ref.indexOf('/');
  const hash = ref.indexOf('#');
  return { owner: ref.slice(0, slash), repo: ref.slice(slash + 1, hash), number: Number(ref.slice(hash + 1)) };
}

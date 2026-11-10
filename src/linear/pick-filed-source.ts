import { isZSession } from './is-z-session.ts';
import { Z_SESSIONS } from './z-sessions.ts';
import type { FiledSource, ZSession } from './types.ts';

interface FiledFacts {
  title: string;
  description: string;
  labels: readonly string[];
  isBotCreator: boolean;
}

const DESIGN_RECORD_LINK = /^<?https:\/\/(?:linear\.app\/[\w.-]+\/document\/|github\.com\/zgeoff\/hq-private\/)/u;

export function pickFiledSource(facts: FiledFacts): FiledSource {
  const marked = facts.isBotCreator ? null : findMarkedSource(facts.description);
  if (marked !== null) {
    return marked;
  }
  if (facts.description.startsWith('From design ') || DESIGN_RECORD_LINK.test(facts.description)) {
    return 'design';
  }
  if (facts.isBotCreator) {
    return 'bot';
  }
  if (/Found by the .*? agent/u.test(facts.description)) {
    return 'agent';
  }
  if ([facts.title, ...facts.labels].some((text) => /live check/iu.test(text))) {
    return 'live check';
  }
  return 'owner';
}

const FILED_BY_MARK = /^Filed by (?<name>[\w-]+)\.$/u;

function findMarkedSource(description: string): ZSession | 'agent' | null {
  for (const text of description.split(/\r?\n/u)) {
    if (text.startsWith('## ')) {
      return null;
    }
    const name = FILED_BY_MARK.exec(text)?.groups?.['name'];
    if (name !== undefined) {
      return isZSession(name, Z_SESSIONS) ? name : 'agent';
    }
  }
  return null;
}

import type { FiledSource } from './types.ts';

interface FiledFacts {
  title: string;
  description: string;
  labels: readonly string[];
  isBotCreator: boolean;
}

const DESIGN_RECORD_LINK = /^<?https:\/\/(?:linear\.app\/[\w.-]+\/document\/|github\.com\/zgeoff\/hq-private\/)/u;

export function pickFiledSource(facts: FiledFacts): FiledSource {
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

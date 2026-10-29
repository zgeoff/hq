import { isRebasedSource } from './is-rebased-source.ts';

// The source as `hq pr status` shows it: a rebased: source names its old head in seven characters.
export function formatAnswerSource(source: string): string {
  return isRebasedSource(source) ? source.slice(0, 'rebased:'.length + 7) : source;
}

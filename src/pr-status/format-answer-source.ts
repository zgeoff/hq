import { isRebasedSource } from './is-rebased-source.ts';

export function formatAnswerSource(source: string): string {
  return isRebasedSource(source) ? source.slice(0, 'rebased:'.length + 7) : source;
}

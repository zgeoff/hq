import { FETCH_STATE } from './fetch-state.ts';

export function resetFetchCache(): void {
  FETCH_STATE.clear();
}

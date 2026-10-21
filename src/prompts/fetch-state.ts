// The last fetch of origin's main in this process, per checkout directory: runMainFetch reads and
// writes it, resetFetchCache clears it. A fetch of one tree never stands in for another.
export const FETCH_STATE = new Map<string, { at: number; error: string | null }>();

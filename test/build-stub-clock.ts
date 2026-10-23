export interface StubClock {
  now: () => number;
  sleep: (pauseMs: number) => void;

  // each pause asked for, in order
  sleeps: number[];
}

// A clock that stands still until something sleeps on it: each sleep moves its time on by the pause,
// at once, so a test of a wait never waits.
export function buildStubClock(startMs: number): StubClock {
  let current = startMs;
  const sleeps: number[] = [];
  return {
    now: () => current,
    sleep: (pauseMs) => {
      sleeps.push(pauseMs);
      current += pauseMs;
    },
    sleeps,
  };
}

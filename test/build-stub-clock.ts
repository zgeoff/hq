export interface StubClock {
  now: () => number;
  sleep: (pauseMs: number) => void;

  sleeps: number[];
}

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

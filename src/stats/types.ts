export interface Dist {
  n: number;
  medianMin: number | null;
  p90Min: number | null;
  thin: boolean;
}

export interface Oldest {
  id: string;
  ageMin: number;
}

export interface Stats {
  window: { from: string; to: string; cutoff: string };
  geoff: {
    queueToAnswer: Dist;
    answerToApply: Dist;
    unblockAddedToDone: Dist;

    // Per run, total minutes waiting on the owner in the window.
    runGeoffWait: Dist;
    oldestQueued: Oldest | null;
    oldestUnapplied: Oldest | null;
    oldestUnblock: Oldest | null;
    oldestRunWait: Oldest | null;

    // Share of owner-wait minutes set with --waits-on-geoff, not by text.
    runWaitExactShare: number | null;
  };
  live: {
    mergeToDone: Dist;
    byRepo: Record<string, Dist>;
    backlog: { total: number; byRepo: Record<string, number>; oldest: Oldest | null };
  };
  idle: {
    slotMinutesWhileReady: number;
    slotMinutesUnknown: number;
    staleShare: number | null;
    samples: number;
    nudges: number;
    nudgesConverted: number;
    nudgesPending: number;
  };
  flow: {
    mergesPerDay: Record<string, number>;
    mergesSource: 'github' | 'hq';
    days: number;
    reviewed: number;
    rechecked: number;
    reworkShare: number | null;
    cycle: Dist;
    cycleFromReady: number; // how many of cycle.n start at ready_since (the rest at launch)
  };
}

export interface GhMerge {
  repo: string;
  mergedAt: string;
}

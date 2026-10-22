// The top-level keys of the JSON other sessions parse today. `a[].b` means every element of the
// array `a` has `b`. A trailing `?` marks a key that may be null or absent (`last?` is null before the
// first ensure; `declared[].promptCheck` is present only while the session has a live atc session; a step's `id?` is absent while its session is not up; `depth?` is null when noslop gives none; `fixChecks[]?` is empty on a noslop review that is not --fixes-only); the keys under it are then not required. Hand-kept: test/capabilities.test.ts runs each command and checks every key
// is in the real output, so this list cannot drift from the commands.
export const SHAPES: Record<string, { command: string; keys: string[] }> = {
  fleet: {
    command: 'hq fleet --json',
    keys: ['ok', 'timer', 'declared[].name', 'declared[].skill', 'declared[].roles', 'declared[].cwd', 'declared[].promptCheck?.state', 'declared[].promptCheck?.since', 'declared[].promptCheck?.hint', 'declared[].promptCheck?.reason', 'retired', 'roles', 'forwards', 'last?.at', 'last?.steps[].name', 'last?.steps[].id?'],
  },
  status: {
    command: 'hq status --json',
    keys: ['ok', 'now', 'open', 'next', 'waits', 'counts', 'nextLater', 'later', 'unblock.open', 'unblock.newSincePush', 'hold', 'outbox'],
  },
  'run list': {
    command: 'hq run list --json',
    keys: ['ok', 'runs[].issue', 'runs[].title', 'runs[].state', 'runs[].next', 'runs[].sessions', 'runs[].prs', 'runningByLane'],
  },
  'run show': {
    command: 'hq run show <issue> --json',
    keys: ['ok', 'run.issue', 'run.title', 'run.state', 'run.next', 'run.sessions', 'run.prs', 'notes'],
  },
  'call list': {
    command: 'hq call list --json',
    keys: ['ok', 'calls[].id', 'calls[].kind', 'calls[].title', 'calls[].question', 'calls[].state', 'calls[].round', 'calls[].answer'],
  },
  'proposal list': {
    command: 'hq proposal list --json',
    keys: ['ok', 'proposals[].id', 'proposals[].kind', 'proposals[].title', 'proposals[].question', 'proposals[].state', 'proposals[].round', 'proposals[].answer'],
  },
  review: {
    command: 'hq review <repo> <pr> --json',
    keys: ['ok', 'repo', 'pr', 'head', 'base', 'effort.effort', 'effort.reason', 'allowDeny.skipped', 'codexCode', 'checks[].name', 'checks[].state', 'checksError', 'openThreads'],
  },
  'pr status': {
    command: 'hq pr status <repo> <pr> --json',
    keys: [
      'ok',
      'pr?.repo',
      'pr?.pr',
      'pr?.head?',
      'pr?.headKnown',
      'pr?.gate?',
      'pr?.gateHead?',
      'pr?.gateAt?',
      'pr?.gateStale',
      'pr?.answer?',
      'pr?.answerHead?',
      'pr?.answerSource?',
      'pr?.answerNote?',
      'pr?.answerAt?',
      'pr?.answerStale',
      'pr?.next?',
      'pr?.nextAt?',
      'pr?.updatedAt',
    ],
  },
  'review (noslop)': {
    command: 'hq review <repo> <pr> --json, on a PR that noslop reviews',
    keys: ['ok', 'engine', 'repo', 'pr', 'head', 'base', 'sha', 'depth?', 'findings', 'notReviewed', 'round', 'fixesOnly', 'fixChecks[]?.findingID', 'fixChecks[]?.fixed', 'fixChecks[]?.reason', 'fixChecks[]?.title', 'checks[].name', 'checks[].state', 'checksError', 'openThreads'],
  },
};

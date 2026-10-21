export interface Check {
  ok: boolean;
  line: string;
}

export interface TreeSync {
  at: string;
  ok: boolean;
  changed: boolean;
  line: string;

  // a ref lock held by another git: retried, then left for the next tick
  transient?: boolean | undefined;

  // the short sha of the detached HEAD the sync put back on main
  reattached?: string | undefined;
}

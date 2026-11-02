export interface Check {
  ok: boolean;
  line: string;
}

export interface TreeSync {
  at: string;
  ok: boolean;
  changed: boolean;
  line: string;

  transient?: boolean | undefined;

  reattached?: string | undefined;
}

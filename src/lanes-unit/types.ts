export interface LanesUnitOpts {
  exec: string[];
  interval: number;
  env: Record<string, string>;
}

export interface InstallResult {
  path: string;
  interval: number;
  replacedTransient: boolean;
}

export interface LanesUnitOpts {
  exec: string[]; // the command that runs this hq
  interval: number; // seconds between looks
  env: Record<string, string>; // HQ_AS, PATH and hq's own HQ_ settings
}

export interface InstallResult {
  path: string;
  interval: number;
  replacedTransient: boolean;
}

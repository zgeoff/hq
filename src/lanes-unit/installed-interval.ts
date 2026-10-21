// The interval the installed unit uses, so a reinstall without --interval keeps it.
export function installedInterval(text: string | null): number | null {
  const m = text?.match(/^ExecStart=.*"--interval" "(\d+)"/m);
  return m ? Number(m[1]) : null;
}

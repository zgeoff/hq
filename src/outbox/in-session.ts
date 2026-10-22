// Since atc 4.7 (GEO-564) the daemon binds a caller to the session whose process tree it
// runs in, so a message hq sends from inside a session counts as that session's, and the
// answer comes back to it as an <atc-answer> notice. Inside a session, hq hands the send to
// a systemd unit, outside every session's tree, and the answer goes nowhere.
export function inSession(): boolean {
  return Boolean(process.env['ATC_SESSION_ID'] || process.env['ATC_SESSION_RECORD']);
}

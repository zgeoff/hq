import { config } from '../config/config.ts';

export function socketPath(): string {
  const named = config().HQ_ATC_SOCKET;
  if (named) return named;
  // A test reaches only the fake atc it names: never the live daemon, even to read.
  if (process.env.NODE_ENV === 'test') return '/nonexistent/hq-test-no-live-atc.sock';
  // atc's own rule: XDG_RUNTIME_DIR when set, else its state dir.
  // ATC_SOCKET is not it: in a session that names the reporter socket.
  return `${process.env['XDG_RUNTIME_DIR'] ?? `${process.env['HOME']}/.local/state/atc`}/atc-daemon.sock`;
}

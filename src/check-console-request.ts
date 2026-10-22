// The console listens on 127.0.0.1 only, and a page on another site must not reach it through
// the browser: a request passes only with its own Host, and with no Origin or its own.
export function checkConsoleRequest(req: Request, port: number): boolean {
  const host = req.headers.get('host'),
    hosts = [`127.0.0.1:${port}`, `localhost:${port}`],
    origin = req.headers.get('origin');
  if (host === null || !hosts.includes(host)) {
    return false;
  }
  return origin === null || hosts.some((h) => origin === `http://${h}`);
}

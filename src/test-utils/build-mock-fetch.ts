type FetchArgs = Parameters<typeof fetch>;

// A fetch stand-in: Bun's fetch type also carries preconnect, which a plain function lacks.
export function buildMockFetch(respond: (input: FetchArgs[0], init?: FetchArgs[1]) => Promise<Response>): typeof fetch {
  return Object.assign(respond, { preconnect: fetch.preconnect });
}

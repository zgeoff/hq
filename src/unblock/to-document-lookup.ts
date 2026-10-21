const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SLUG_ID = /(?:^|-)(?<slugID>[0-9a-f]{12})$/iu;

export type DocumentLookup = { by: 'id'; id: string } | { by: 'slugID'; slugID: string };

export function toDocumentLookup(ref: string): DocumentLookup {
  const last = ref.replace(/[?#].*$/u, '').replace(/\/+$/u, '').split('/').at(-1) ?? ref;
  if (UUID.test(last)) {
    return { by: 'id', id: last };
  }
  const slugID = SLUG_ID.exec(last)?.groups?.['slugID'];
  return slugID === undefined ? { by: 'id', id: last } : { by: 'slugID', slugID };
}

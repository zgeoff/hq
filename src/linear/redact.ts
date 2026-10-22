// Any text that leaves this module: the key, and anything shaped like a Linear key, is cut out,
// since Linear's own error text can echo what it was sent.
export function redact(text: string, k: string | null): string {
  let t = k ? text.split(k).join('[key]') : text;
  t = t.replace(/lin_(?:api|oauth)_[A-Za-z0-9]+/g, '[key]');
  return t;
}

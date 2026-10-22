// Masking for text hq stores from transcripts (refusals.ts). A pattern per token family, then a
// catch-all for long runs. Mask first, truncate after: a cut must never leave half a token.
const MASK = '[redacted]';

const PATTERNS: [RegExp, string][] = [
  [/github_pat_[A-Za-z0-9_]{8,}/g, MASK],
  [/\bgh[pousr]_[A-Za-z0-9]{8,}/g, MASK],
  [/\bsk-ant-[A-Za-z0-9_-]{6,}/g, MASK],
  [/\bsk-[A-Za-z0-9_-]{12,}/g, MASK],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, `Bearer ${MASK}`],
  [/\bops_[A-Za-z0-9+/=_.-]{8,}/g, MASK],
  [/\bAKIA[0-9A-Z]{16}\b/g, MASK],
  [/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]*)?/g, MASK],
  // "DB_PASSWORD=two words": the quote opens before the name, so the value runs to its close.
  [/(["'])([A-Za-z0-9_-]*(?:KEY|TOKEN|SECRET|PASSWORD)=)(?:\\[\s\S]|(?!\1)[^\\])*\1?/gi, `$1$2${MASK}$1`],
  // KEY=value, API_TOKEN="value", password=value: the name stays, the value goes. The value is the
  // whole shell word: "double" (with \" escapes), 'single', \-escaped characters, joined runs.
  [/\b([A-Za-z0-9_-]*(?:KEY|TOKEN|SECRET|PASSWORD))=(?!\[redacted\])(?:"(?:[^"\\]|\\[\s\S])*"|'[^']*'|\\[\s\S]|\S)+/gi, `$1=${MASK}`],
];

// 32+ base64, hex or url-safe characters. A '/' joins a run, so a long all-lowercase path is not
// one: with a '/', only a run mixing upper case, lower case and a digit counts.
const RUN = /[A-Za-z0-9+/_-]{32,}={0,2}/g;
const tokenLike = (run: string) => !run.includes('/') || (/[A-Z]/.test(run) && /[a-z]/.test(run) && /\d/.test(run));

export function redact(s: string): string {
  let out = s;
  for (const [re, to] of PATTERNS) out = out.replace(re, to);
  return out.replace(RUN, (m) => (tokenLike(m) ? MASK : m));
}

// Today's wording: "... is final (again) at <sha>" next to a PR reference. It has no u: with i, u adds
// Unicode case folding, so "ſ" would match the s in "is". Callers read the group by index.
// oxlint-disable-next-line prefer-named-capture-group, require-unicode-regexp
export const FINAL_PHRASE = /\bis final(?: again)? at ([0-9a-f]{7,40})\b/i;

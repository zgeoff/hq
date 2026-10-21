// What Codex prints instead of a review when it can't run one: hq then fails, never passes it off as clean.
// Only Codex's own lines count, at the start of a line: the transcript also holds the diff and tool
// output, whose lines start with +, - or a space, and a review of this very check prints these words.
export const CODEX_UNAVAILABLE = /^(?:ERROR: You.ve hit your usage limit|Review was interrupted\.)/m;

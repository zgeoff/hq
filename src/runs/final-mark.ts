// The fixed phrase briefs ask for: "FINAL <repo>#<n> <sha>". Callers read the groups by index.
// oxlint-disable-next-line prefer-named-capture-group
export const FINAL_MARK = /^\s*FINAL\s+(\S+#\d+)\s+([0-9a-f]{7,40})\b/u;

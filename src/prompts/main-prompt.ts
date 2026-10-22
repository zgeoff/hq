// A start prompt is either "main:<path in hq-private>", read from origin/main after a
// fetch, never from the working tree (the owner approves the prompt as it stands on main, and the
// z- sessions edit that checkout), or an absolute path to a file outside any repo (z-q's own).
export const mainPrompt = (rel: string) => `main:${rel}`;

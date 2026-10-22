// Every allow-or-deny check has a committed table of hostile
// inputs, and an unknown input is denied. `codex review --base` takes no prompt of its own, so the
// question goes to a second, read-only Codex pass in the same worktree.
export const ALLOW_DENY_QUESTION = 'For any allow-or-deny check this diff adds or changes: what does an unknown input get, and is there a committed table of hostile inputs it must refuse?';

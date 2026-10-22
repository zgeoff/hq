# calls

Calls, steward proposals and the owner's unblock list live in `hq`, the sessions' own command-line tool. The background session `z-triage` prepares the calls and adds them; you are the one place the owner hears them. You walk him through the waiting items one at a time, record each answer, and apply them all yourself when the walk ends. Every `hq` command takes `--json`, and `hq` knows which session runs it. Never edit `hq`'s database by hand.

## the commands

- `hq status` shows the open call or proposal, what comes next, and why it waits. `hq open` opens the next one; `hq` keeps one call or proposal open at a time.
- `hq call answer <call id> --answer "<his words>"` records his answer. After you apply it, `hq call apply <call id> --to typed:<session>|linear:<GEO-n>|none` records where it went.
- `hq call later <call id>` puts a call off until the next 07:00 Sydney time.
- `hq call skip <call id> --reason "<what changed>"` marks an answer you didn't apply because the issue changed after you sent the call. The check's next re-add brings it back from the issue as it stands.
- `hq unblock pushed --upto <N>` records that you pushed the unblock list, with the N that `hq unblock new` gave.
- `hq unblock rank <slug> <N>` moves an item on the unblock list when the owner wants it higher or lower.

## putting a call

- **Decide it yourself** when the call is a design choice on a Low or Medium issue, its recommendation is one you agree with, and nothing in it is deleting or rewriting the owner's data, anything that touches Nix's memory or identity, credentials, scope and naming, a new session, a priority, and a High or Urgent security change. Open the call with `hq open`, record the decision with `hq call answer`, then apply the recommendation and comment "Decided under the GEO-904 grant: <the choice>. To undo: <how>." Run `hq call apply` once it applied, post one line to `hq news`, and open the next call.
- **Send the next call**: open it with `hq open`, which refuses while a call or proposal is open, or in the quiet hours. Send it with a push notification when your host has one, headed "<what it decides> (<GEO-n>)", with its links: the issue, each PR, and any settings page it names. When `hq` tells you an open call closed, it no longer needs him: tell him in one line, and go on.
- **Untracked PRs** go to him as one call: their count by repo, and the recommendation.
- **When the owner asks what is open**, send one line per call from `hq status` and `hq call list`: the open call, each call put off, marked as such, then the queued calls in order.
- **Walk, then apply.** Record each answer with `hq call answer` as he gives it, and open the next item at once, since an answered call no longer holds `hq open`'s one open slot. For a "Later", run `hq call later` at once instead, since an answered call can't be put off. Apply nothing during the walk, so he never waits on you between items. When the walk ends or he steps away, apply every recorded answer in one pass, between checks too. Before you apply an answer on a flagged issue or a shared decision, read each issue again. If it no longer carries `Needs Geoff`, or it changed after you sent the call, apply nothing: tell the owner in one line what changed, and skip it. For each answer:
  - A blocked decision: type his answer into the delivery session with `atc_terminal_type`. How to write that line is in this file's private half: read `skills/intake/references/calls.private.md` in the local hq-private clone (`hq defs` shows where it is) and follow it as part of this skill. Never message the agent yourself.
  - A flagged issue, or each issue of a shared decision: make the change he chose, remove `Needs Geoff`, and comment his decision in his words, in the form this file's private half gives. Closing as not planned, a scope change, or a new project count as his decision once he answers.
  - An untracked PR: when he wants an issue, file one in its state (Done for a merged PR) and link the PR. Otherwise leave it.
  - "Later": run `hq call later <call id>`. Once it is due, `hq` queues it again.

  For any answer but Later, record his words with `hq call answer` before you change anything, and once you applied them, `hq call apply`, including an answer that changes nothing, such as "leave it" (`--to none`). A skipped answer runs `hq call skip`. When the pass ends, confirm in one message what you changed, one line per item.

## review answers

`hq` messages `console answer: review <id>: <label> | <note>` when the owner answers a PR-review item in the console with lgtm, Changes, Later or Reject. Relay it to `z-review` as one atc message, in the form this file's private half gives, as you relay an lgtm he gives in chat. A Reject is his line for that PR like any other: relay it the same way. When the owner says to merge a PR anyway, record it yourself with `hq pr override <repo> <pr> --source <source> --note '<why>'`, then tell `z-review` it is on record. When he accepts a finding's risk, record it with `hq pr accept-risk <repo> <pr> <finding-id> --source <source> --note '<why>'` and tell `z-review`. Which source counts is in this file's private half.

## rules

- Give each call its full context and its links, since that is where the owner needs it.
- Record the owner's words, not a summary of them, in every comment you write for him.
- Put a new behaviour the owner didn't ask for, such as a follow-up issue that adds one, as its own call, never as an add-on to another call, where one "lgtm" would cover it.
- Never send a call twice. An item that comes back after the owner answered it is new information: say so in its call.

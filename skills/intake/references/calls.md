# Calls

A call is one decision only the owner can make, with a recommendation. `z-triage` prepares calls in
hq; a proposal is a call hq makes itself, put the same way. You take the owner through them one at a time,
record each answer as the owner gives it, and apply them together when the owner is done. Never edit hq's database
by hand.

Each call is a flagged issue (one with the Linear label `Needs Geoff`), a shared decision (one
choice, several issues), or a blocked decision (a session such as `z-delivery` waits on it). The
count of PRs that cite no Linear issue is not a call. When the owner asks for an issue for one of
those PRs, file the issue in the state that matches the PR, Done if it merged, and link the PR.

## Commands

- `hq status`: the open call, what's next, and why it waits. `hq open` opens the next; one is open
  at a time.
- `hq call answer <call id> --answer "<the owner's words>"` records an answer.
  `hq call apply <call id> --to typed:<session>|linear:<GEO-n>|none` records where it went.
- `hq call later <call id>`: off until the next 07:00 Sydney.
- `hq call skip <call id> --reason "<what changed>"`: an answer not applied because the issue
  changed; the next check re-adds the call.
- `hq unblock rank <slug> <N>`: move an unblock item when the owner asks.

## Putting a call

- **Decide it yourself** when it's a design choice on a Low or Medium issue and you agree with the
  recommendation. Send it to the owner instead when it touches anything `owner-calls` lists as the owner's.

  Your `z-stu-decisions` grant covers these. Open it, record it with `hq call answer`, apply it, and comment
  "Decided under Stu's `z-stu-decisions` grant: <the choice>. To undo: <how>." Then `hq call apply`, and one
  line to `hq news add --topic other --text "<the line>"`.

- **Send the next call:** `hq open` (it refuses while one is open, and in quiet hours). Push it when
  your host can, headed "<what it decides> (<GEO-n>)", with its links. When hq says an open call
  closed, tell the owner in one line and open the next.
- **"What's open?":** one line per call from `hq status` and `hq call list`: the open one, the
  put-off ones (marked), then the queue in order.

Each call carries its full context and links; the owner decides from the call alone. A new behaviour the owner
didn't ask for is its own call, never an add-on one "lgtm" would cover. Never send a call twice; if
hq re-queues an answered one, say what changed.

## Going through the calls

Record each answer at once and open the next; apply nothing until the owner is done. "Later" is
`hq call later` at once, since an answered call can't be put off.

When the owner is done or steps away, apply every answer in one pass:

1. For a flagged issue or a shared decision, re-read each issue first. If it lost `Needs Geoff` or
   changed since you sent the call, apply nothing: tell the owner what changed, and `hq call skip`. A
   blocked decision skips this step, since its issue may never have had the label.
2. Apply by kind:
   - **Blocked decision:** type the owner's answer into the asking session with `atc_terminal_type`, written
     as `skills/intake/references/calls.private.md` in hq-private says. Never message the agent.
     Remove `Needs Geoff` from each of the call's issues that no other open call names.
   - **Flagged issue or shared decision:** make the change, remove `Needs Geoff`, and comment the
     owner's decision in the owner's words, in `calls.private.md`'s form. The answer settles a close, a scope change
     or a new project.
3. `hq call apply` for each, even "leave it" (`--to none`).
4. One message: one line per call on what you changed.

## Review answers

When hq sends `console answer: review <id>: <label> | <note>`, record it with
`hq pr answer <repo> <pr> lgtm|changes|reject --source console:<id>` (`--note` for Changes). "Later"
has no record. Relay nothing.

- The owner says to merge a PR its gate blocks:
  `hq pr override <repo> <pr> --source <source> --note '<why>'`.
- The owner accepts a finding's risk:
  `hq pr accept-risk <repo> <pr> <finding-id> --source <source> --note '<why>'`.

Message `z-review` that each is on record. `calls.private.md` says which source counts.

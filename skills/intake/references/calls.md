# Calls

A call is one decision only the owner can make, with a recommendation. `z-triage` prepares calls in
hq; a proposal is a call hq makes itself, put the same way. You take him through them one at a time,
record each answer as he gives it, and apply them together when he's done. Never edit hq's database
by hand.

Kinds: a flagged issue (`Needs Geoff`), a shared decision (one choice, several issues), a blocked
decision (a z- session waits), and untracked PRs.

## Commands

- `hq status`: the open call, what's next, and why it waits. `hq open` opens the next; one is open
  at a time.
- `hq call answer <call id> --answer "<his words>"` records an answer.
  `hq call apply <call id> --to typed:<session>|linear:<GEO-n>|none` records where it went.
- `hq call later <call id>`: off until the next 07:00 Sydney.
- `hq call skip <call id> --reason "<what changed>"`: an answer not applied because the issue
  changed; the next check re-adds the call.
- `hq unblock rank <slug> <N>`: move an unblock item when he asks.

## Putting a call

- **Decide it yourself** when it's a design choice on a Low or Medium issue and you agree with the
  recommendation. Send it to him instead when it touches anything `owner-calls` lists as his.

  Your Decisions grant covers these. Open it, record it with `hq call answer`, apply it, and comment
  "Decided under Stu's Decisions grant: <the choice>. To undo: <how>." Then `hq call apply`, and one
  line to `hq news add --topic other --text "<the line>"`.

- **Send the next call:** `hq open` (it refuses while one is open, and in quiet hours). Push it when
  your host can, headed "<what it decides> (<GEO-n>)", with its links. When hq says an open call
  closed, tell him in one line and open the next.
- **Untracked PRs** are one call: the count by repo and the recommendation.
- **"What's open?":** one line per call from `hq status` and `hq call list`: the open one, the
  put-off ones (marked), then the queue in order.

Each call carries its full context and links; he decides from the call alone. A new behaviour he
didn't ask for is its own call, never an add-on one "lgtm" would cover. Never send a call twice; if
hq re-queues an answered one, say what changed.

## Going through the calls

Record each answer at once and open the next; apply nothing until he's done. "Later" is
`hq call later` at once, since an answered call can't be put off.

When he's done or steps away, apply every answer in one pass:

1. For a call about an issue, re-read the issue first. If it lost `Needs Geoff` or changed since
   you sent the call, apply nothing: tell him what changed, and `hq call skip`.
2. Apply by kind:
   - **Blocked decision:** type his answer into the asking session with `atc_terminal_type`, written
     as `skills/intake/references/calls.private.md` in hq-private says. Never message the agent.
   - **Flagged issue or shared decision:** make the change, remove `Needs Geoff`, and comment his
     decision in his words, in `calls.private.md`'s form. His answer settles a close, a scope change
     or a new project.
   - **Untracked PR:** if he wants an issue, file it in the PR's state (Done if merged) and link it.
3. `hq call apply` for each, even "leave it" (`--to none`).
4. One message: one line per call on what you changed.

## Review answers

When hq sends `console answer: review <id>: <label> | <note>`, record it with
`hq pr answer <repo> <pr> lgtm|changes|reject --source console:<id>` (`--note` for Changes). "Later"
has no record. Relay nothing.

- He says to merge a PR its gate blocks:
  `hq pr override <repo> <pr> --source <source> --note '<why>'`.
- He accepts a finding's risk:
  `hq pr accept-risk <repo> <pr> <finding-id> --source <source> --note '<why>'`.

Message `z-review` that each is on record. `calls.private.md` says which source counts.

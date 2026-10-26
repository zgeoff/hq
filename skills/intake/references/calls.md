# calls

Calls and the owner's unblock list live in `hq`, the sessions' own command-line tool. `z-triage` prepares each call and adds it to `hq`, and you are the one place the owner hears it. You walk him through the waiting items one at a time, record each answer as he gives it, and apply the answers together when the walk ends. Every `hq` command takes `--json`, and `hq` knows which session runs it. Never edit `hq`'s database by hand.

## the commands

- `hq status` shows the open call or proposal, what comes next, and why it waits. `hq open` opens the next one; `hq` keeps one call or proposal open at a time.
- `hq call answer <call id> --answer "<his words>"` records his answer. After you apply it, `hq call apply <call id> --to typed:<session>|linear:<GEO-n>|none` records where it went.
- `hq call later <call id>` puts a call off until the next 07:00 Sydney time, when `hq` queues it again.
- `hq call skip <call id> --reason "<what changed>"` marks an answer you didn't apply because the issue changed after you sent the call. The check's next re-add brings the call back from the issue as it stands.
- `hq unblock pushed --upto <N>` records that you pushed the unblock list, with the N that `hq unblock new` gave.
- `hq unblock rank <slug> <N>` moves an item on the unblock list when the owner wants it higher or lower.

## putting a call

- **Decide it yourself** when the call is a design choice on a Low or Medium issue, its recommendation is one you agree with, and nothing in it is deleting or rewriting the owner's data, anything that touches Nix's memory or identity, credentials, scope and naming, a new session, a priority, and a High or Urgent security change. Open the call with `hq open`, record the decision with `hq call answer`, apply the recommendation, and comment "Decided under Stu's Decisions grant: <the choice>. To undo: <how>." Then run `hq call apply`, post one line to `hq news`, and open the next call.
- **Send the next call.** Open it with `hq open`, which refuses while a call or proposal is open and in the quiet hours. Send it with a push notification when your host has one, headed "<what it decides> (<GEO-n>)", with its links: the issue, each PR, and any settings page it names. When `hq` tells you an open call closed, it no longer needs him: tell him in one line, and go on.
- **Untracked PRs** go to him as one call: their count by repo, and the recommendation.
- **When the owner asks what is open**, send one line per call from `hq status` and `hq call list`: the open call, each call put off, marked as such, then the queued calls in order.

## the walk

Record each answer with `hq call answer` as he gives it, and open the next item at once: an answered call no longer holds `hq open`'s one open slot. A "Later" is the exception: run `hq call later` at once instead, since an answered call can't be put off. Apply nothing during the walk, so he never waits on you between items.

When the walk ends or he steps away, apply every recorded answer in one pass, whether or not a check runs in between:

1. Before you apply an answer on a flagged issue or a shared decision, read each of its issues again. When one no longer carries `Needs Geoff`, or changed after you sent the call, apply nothing: tell the owner in one line what changed, and run `hq call skip`.
2. Apply the answer by its kind:
   - A blocked decision: type his answer into the z- session that asked, with `atc_terminal_type`, and never message the agent yourself. How to write that line is in this file's private half: read `skills/intake/references/calls.private.md` in the local hq-private clone (`hq defs` shows where it is) and follow it as part of this skill.
   - A flagged issue, or each issue of a shared decision: make the change he chose, remove `Needs Geoff`, and comment his decision in his words, in the form the private half gives. Closing as not planned, a scope change and a new project count as his decision once he answers.
   - An untracked PR: when he wants an issue, file one in the PR's state (Done for a merged PR) and link the PR. Otherwise leave it.
3. Run `hq call apply` for each applied answer, including one that changes nothing, such as "leave it" (`--to none`).
4. Confirm in one message what you changed, one line per item.

## review answers

`hq` messages `console answer: review <id>: <label> | <note>` when the owner answers a PR-review item in the console with lgtm, Changes, Later or Reject. Record it with `hq pr answer <repo> <pr> lgtm|changes|reject --source console:<id>`, with `--note` for Changes, as you record an answer he gives in chat. `z-review` and `hq review gate` read the record, so send no relay message. A Later has no record.

When the owner says to merge a PR anyway, record it with `hq pr override <repo> <pr> --source <source> --note '<why>'`. When he accepts a finding's risk, record it with `hq pr accept-risk <repo> <pr> <finding-id> --source <source> --note '<why>'`. Tell `z-review` each one is on record. Which source counts is in this file's private half.

## rules

- Give each call its full context and its links, since that is where the owner needs it.
- Record the owner's words, not a summary of them, in every comment you write for him.
- Put a new behaviour the owner didn't ask for, such as a follow-up issue that adds one, as its own call. As an add-on to another call, one "lgtm" would cover it unseen.
- Never send a call twice. An item that comes back after the owner answered it is new information: say so in its call.

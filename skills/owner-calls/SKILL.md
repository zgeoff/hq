---
name: owner-calls
description:
  What only the owner decides, how a session puts something to the owner, how the owner's answers
  count, and the fleet's shared terms. Load it before you flag an issue for the owner, send a
  decision or a hands-on step for the owner, decide something under a grant, or act on an answer of
  the owner's.
---

# Owner calls

Some choices belong to the owner alone. Tell those choices from your own, put each one to the
owner with everything needed to decide it, and act on the answer only once hq has a record of it.

[Terms](#terms) defines the shared words. Once you send a decision or a
hands-on step, carry on with other work. `z-stu` types the answer into your
session once hq records it, so a line from `z-stu` is already on record.

Avoid these traps:

- Asking the owner directly. Every decision goes through one queue.
- Passing an answer on by message. `hq review gate` and every session read only hq's records.
- Adding a new behaviour to a decision, so that a "yes" also covers it.
- Sending `z-stu` news. Post it with `hq news add`.

## Key rules

- [Terms](#terms): the fleet's shared words, defined once for every role skill.
- [What only the owner decides](#what-only-the-owner-decides): send each item on the list to the
  owner, even under a grant; decide anything else yourself, such as a Data Action that only adds
  data after a backup, or a decision that keeps a course the list doesn't name.
- [Put it to the owner](#put-it-to-the-owner): send a decision to `z-triage`, add a hands-on step
  to the unblock list, and give each its full context.
- [Messages to `z-stu`](#messages-to-z-stu): only what the owner needs to know or do; reply in 2
  lines.
- [The owner's answers are records](#the-owners-answers-are-records): act only on a record in hq;
  only `z-stu` records the owner's answers.

## Terms

- **The owner:** the person the fleet works for. An issue with the Linear label `Needs Geoff` waits
  on a decision from the owner. A Design issue with the Linear label `with-geoff` has the owner in
  its design session.
- **hq:** the CLI that runs the fleet, and the store of its records. `hq --help` lists the commands.
- **atc:** the tool that runs the sessions and carries messages between them. Send a message to a
  session with `atc_message_send`.
- **`z-stu`:** runs the owner's conversation, puts calls to the owner, and records the answers.
- **`z-triage`:** grooms Linear, and turns each decision of the owner's into a call.
- **`z-delivery`:** launches the builder agents.
- **`z-review`:** reviews and merges PRs.
- **`z-qa`:** runs the live checks.
- **`z-release`:** takes merged work live.
- **`z-q`:** develops hq itself.
- **Nix:** the owner's personal agent. **nixie** is the service that runs Nix.
- **A grant:** a standing permission. It is a line in the "You are allowed to:" list of your start
  prompt, or a line the owner types into your session.
- **A call:** an hq record of one decision put to the owner.
- **A hands-on step:** a step only the owner can do, such as an approval tap. **The unblock list**
  holds them: `hq unblock list` shows it.
- **The gate:** `hq review gate`, which decides whether a PR may merge.
- **A vault:** a 1Password vault.
- **A pass:** one run of `z-triage` over the Linear issues, every 30 minutes.
- **The check:** the step after each pass in which `z-triage` makes the owner's open decisions
  calls.
- **An Action:** one line in an issue's Actions section, such as `Code delivery` or a `Data:` line.
  [tickets](../tickets/SKILL.md#actions) gives the forms.
- **A pitch:** the list of Actions that `z-delivery` sends as a decision before a launch, as
  [Pitches](../delivery-lead/SKILL.md#pitches) says.
- **Your role's private file:** `SKILL.private.md` in hq-private, the private repo that holds the
  start prompts. `hq defs` prints where the hq-private checkout is.

## What only the owner decides

Send each of these to the owner, even when a grant seems to cover it: deleting or rewriting the owner's data, anything that touches Nix's memory or identity, credentials the owner has not approved, naming, security design, a new session, and setting a High or Urgent priority on a security change.

Also his:

- closing an issue whose work is still worth doing, or as not planned;
- a new project;
- dropping an issue's outcome, adding behaviour to it, or loosening a rule he set in the issue, its
  comments or a design record;
- loosening a repo's ruleset, changing its visibility, or touching any of its secrets;
- an Action beyond Code delivery, Investigation, Spike or Design session: Data that deletes or
  rewrites, Deploy, Infra, Credentials, Posting, or Paid API over its limit;
- accepting a finding's risk, or merging a PR its gate blocks;
- product direction, and a cost only he can accept.

In both of the owner's lists, a new session is a new z- session, and the Paid API limit is the
threshold that [Actions](../tickets/SKILL.md#actions) sets, not the limit an Action line names.
Closing as not planned drops work that nobody carries on. The closes in linear-triage's
[closing.md](../linear-triage/references/closing.md) stay with `z-triage`. To change either list, edit
[grants/still-ask.yaml](../../grants/still-ask.yaml), then run `bun run grants` in the hq checkout
to write it here.

Decide these yourself, with no owner call:

- Code delivery, Investigation, Spike, a Design session without the owner, and each Linear edit the
  owner's lists leave out. Whether the owner joins a design session is his to decide;
- a Data Action that only adds data, run after a backup of that datastore: it inserts rows, adds
  tables or columns, or fills in columns it added. An additive change to anything else on the
  owner's lists, such as Nix's memory, stays his;
- a step, such as a rotation, on a credential that the owner approved in a call or a pitch. Look for
  the approval first;
- listing a vault to see whether an item exists. Using the item in work is a Credentials Action;
- a decision whose recommendation keeps the current course, such as "keep fixing". Carry on. When
  the course itself is on the owner's lists, such as a cost over its limit, the decision stays his.

Decide anything else yourself, under your grants or the Actions that the issue names.

## Put it to the owner

The owner answers in batches, through one queue: `z-triage` turns each decision of the owner's into a call, and
`z-stu` puts the call to the owner. Never ask the owner directly. To tell the owner something
without a decision, such as a deploy hold, send it with the `PushNotification` tool.

- **Send a decision on the list to `z-triage`** with `atc_message_send`: the question, the options
  and your recommendation. When the decision has an issue, `z-triage` labels it `Needs Geoff`. At
  its next check, `z-triage` makes the decision a call, whether or not it has an issue. When the
  list leaves the decision to you, `z-triage` refuses it and tells you to carry on.
- **Add a hands-on step to the unblock list:**
  `hq unblock add --task '<what the owner does>' --done-when <condition>`. The condition is
  `issue:GEO-<n>`, `pr:<repo>#<n>`, `doc:<Linear document ID>`, `release:<repo>` or
  `date:<ISO time>`.
- **Look up a credential before you ask for it:** run `op item list --vault <repo>`, and the same
  for the shared vault that your role's private file names. Ask the owner only for an item that is
  missing, or that sits in the owner's personal vaults.

Give each decision and each step its full context and links, so that the owner can decide from it
alone.

Before you propose a change to something the owner approved, read the issue's comments and the PR's
history. In the proposal, say what the owner decided.

## Messages to `z-stu`

Message `z-stu` only with what the owner needs to know or do:

- an owner answer for `z-stu` to record;
- an approved action that a permission check blocked;
- a failure the owner must hear now;
- a step your role skill sends to `z-stu` by name.

Send a decision to `z-triage` and a hands-on step to the unblock list, as
[Put it to the owner](#put-it-to-the-owner) says. Post news with `hq news add`.

When `z-stu` messages you, reply with the `answer` tool, in 2 lines at most. If you end your turn
without the tool, atc sends your whole final reply to `z-stu`.

## The owner's answers are records

Act only on an answer that hq records. Never pass an answer on to another session by message: the
gate and every session read only hq's records.

One exception: when the owner types a grant into your session, act on it at once, for that
session's life. Send the line to `z-stu` with `atc_message_send`, so that `z-stu` records it.
When Claude Code's permission check blocks an action that the owner already approved in a call or
a [pitch](../delivery-lead/SKILL.md#pitches), the blocked agent tells `z-stu` with
`atc_message_send`. `z-stu` types the owner's recorded words from that approval into the agent's
session, and sends the owner no new call. For an agent that `z-delivery` launched, `z-delivery`
types the granting line instead, as its [Refusals](../delivery-lead/SKILL.md#refusals) section says.

Every other session records only its own acts:

- **Log each act under a grant:** run `hq grant act <name> --target <issue, PR or command>`. The
  name is the one in your start prompt's "Log it with" line.
- **In `z-review`, record a mechanical edit to an instruction file:** run
  `hq pr mechanical <repo> <pr>`.

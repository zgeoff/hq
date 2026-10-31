---
name: owner-calls
description:
  What only the owner decides, how a session puts something to him, and how his answers count. Load
  it before you flag an issue for him, send a decision or a step for him, decide something under a
  grant, or act on an answer of his.
---

# Owner calls

The owner answers through one queue, in batches: `z-triage` turns decisions into calls, and `z-stu`
puts each to him. No other session asks him directly. To tell him something, such as a deploy hold,
push a notification.

## What only he decides

These always go to him: deleting or rewriting the owner's data, anything that touches Nix's memory or identity, credentials, scope and naming, a new session, a priority, and a High or Urgent security change.

Also his:

- closing an issue whose work is still worth doing, or as not planned;
- a new project;
- an Action beyond Code delivery, Investigation, Spike or Design session: Data that deletes or
  rewrites, Deploy, Infra, Credentials, Posting, or Paid API over its limit;
- accepting a finding's risk, or merging a PR its gate blocks;
- product direction, and a cost only he can accept.

A choice that touches none of these is yours to make under your grants, or the issue's.

## Putting it to him

- **A decision:** message `z-triage` the question, the options and your recommendation. `z-triage`
  itself flags the issue (`Needs Geoff`) and the check makes it a call.
- **A step only his hands can do,** such as an approval tap:
  `hq unblock add --task '<what he does>' --done-when issue:GEO-<n>` (or `pr:<repo>#<n>`).
- **A credential:** first list the repo's vault and the shared vault, as your role's private file
  says. Only a missing item, or one in his personal vaults, waits on him.

Each carries its full context and links, so he decides from it alone. A new behaviour he didn't ask
for is its own question, never an add-on that a "yes" to something else would cover. Before you
propose changing something he approved, read its history and say what he decided.

## His answers are records

hq records his answers: `hq call answer`, `hq pr answer`, `hq pr override`, `hq pr accept-risk`, and
each line typed into a session with `hq typed add`. Gates and sessions read only those records, so
never pass an answer on by message. Only `z-stu` records his answers, from the sources its private
files name. Each other session records its own acts, such as a rebase, a mechanical edit or a grant
he gave it in chat.

- A grant he gives in chat holds for that session's life: log it with `hq grant act` and tell
  `z-stu`.
- Each act under a standing grant: `hq grant act <name> --target <issue, PR or command>`.

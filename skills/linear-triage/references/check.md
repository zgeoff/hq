# The check

The check turns each decision the owner must make into a call in hq: one question with options and
your recommendation, which `z-stu` puts to the owner. You never message the owner, and you never
apply the owner's answer.

Calls come from two places, with no cap:

- the issues flagged `Needs Geoff`, as linear-triage's Flagging section allows;
- each decision that blocks a session and that
  [owner-calls](../../owner-calls/SKILL.md#what-only-the-owner-decides) lists as the owner's:
  `z-delivery` and `z-review` message you, or ask you to check now.

Settle any other blocked decision yourself, and tell its sender. Step 5 refuses two kinds of these
for you. The PRs that cite no issue are never a call: step 4 reports them.

Contents: [State](#state) · [Steps](#steps) · [Calls](#calls) · [Unblock list](#unblock-list)

## State

- Read hq output with `--json`. Pass no session flag; hq knows who you are. Never edit hq's database
  by hand.
- The check's state is `~/.local/share/z-sessions/refine.md`: the "CHECK at <UTC time>" lines,
  your atc events cursor, and each open blocked decision, one JSON line with its call id. The pass
  keeps its own state in `triage.md`.

## Steps

1. **Gather the blocked decisions that owner-calls lists as the owner's**, and settle the rest
   yourself, as the opening says. Put them in a JSON array in scratch:
   `{"question", "recommendation", "session", "issue", "actions", "statusQuo", "ownerListed"}`,
   with `issue: null` when there's none. `actions` lists each Action line the decision would
   approve, in the [tickets](../../tickets/SKILL.md#actions) forms. Set `statusQuo: true` when the
   recommendation keeps the current course, such as "keep fixing". Set `ownerListed: true` when the
   recommended option would itself do something the owner-calls list names, such as touch Nix's
   memory or keep a cost over its limit. Settle a step on a credential the owner approved yourself:
   find the approval with `hq call list --state all`, which holds each pitch too, since a pitch
   reaches the owner as a call. Then tell the sender to carry on.
   Sources: messages from sessions, and atc events of kind `decision` or `blocked` since your
   cursor. Save the new cursor. If `atc_events_read` refuses the cursor with `bad_args`, read
   without one, and say in the CHECK line that earlier notes may be missed. A decision stays open,
   and in `refine.md`, until `hq call list --state all` shows it answered or its sender says it's
   settled. Put a step that needs the owner's hands on the [unblock list](#unblock-list).
2. **Fetch the flagged issues:** team GEO, label `Needs Geoff`, with `id`, `title`, `url`, `status`,
   `priority`, `createdAt` and `updatedAt`, through `list_issues`. Save every page.
3. **Complete `notes.json`** (start it as `{}` without a pass), one entry per flagged issue:
   `{"GEO-9001": {"question": "Split GEO-9001?", "recommendation": "Yes, because 16 PRs landed.", "actions": [], "statusQuo": false, "ownerListed": false}}`.
   For a flag the pass didn't set, read the issue's latest comment.
   - When the comment asks only what you can settle (a missing section, a missing `Code delivery`, a
     named blocker), fix it, remove `Needs Geoff`, and write `{"resolved": true}`.
   - When the comment asks what
     [owner-calls](../../owner-calls/SKILL.md#what-only-the-owner-decides) lists as the owner's,
     or whether the owner joins a design session, keep the flag. Otherwise settle it yourself, as
     for the case above. Give every entry `actions`, `statusQuo` and `ownerListed`, as step 1 says.
     `check.private.md` in hq-private (`hq defs` shows where) says which credentials are another
     session's.
   - Issues waiting on one decision get the same question text, word for word, so they become one
     call.
4. **Find untracked PRs:** `scripts/untracked-prs.sh 2` lists `zgeoff` PRs that cite no issue, open
   or merged in 2 days. Search Linear for each by repo and number first; when an issue holds it, add
   "Contributes to GEO-<n>" to the PR with `gh pr edit`. Trace the rest to an issue, or close one as
   superseded when you're sure. Leave the rest as they are: `build-queue.sh` counts them in part 1,
   and `--prs` lists them.
5. **Build the calls:**
   `scripts/build-queue.sh --calls --blocked <file> --notes <file> --untracked <file> <issue pages>`
   prints each call's kind, question and recommendation as JSON, in `z-stu`'s order. It refuses a
   decision without `ownerListed: true` that has `statusQuo: true`, or whose `actions` are all ones
   owner-calls leaves to the fleet: `Code delivery`, Investigation, Spike, Design session, `Linear:`
   and insert-only Data lines, in the forms that [tickets](../../tickets/SKILL.md#actions) gives. It prints one `refused` line for each, and
   exits 1.
   - Settle each refused decision yourself. Tell its sender to carry on, with `atc_message_send`,
     or, for an issue, remove `Needs Geoff` and write `{"resolved": true}`. Then run the script
     again.
   - Write each call's card as [Calls](#calls) says, after reading the issue, its comments and
     linked work.
6. **Update hq:** run `hq outbox flush --retry`. Re-add every call in order, including open and
   put-off ones. Close each call in `hq call list` that's no longer gathered, and drop each unblock
   item whose session says it's done. hq tells `z-stu` itself.
7. **End:** save "CHECK at <UTC time>" in `refine.md`, and delete your scratch files and the pass's.

**Reply:** one line per call added or closed, or "<UTC time> check: nothing new."

## Calls

`hq call add <call id> --issues <GEO-n,…> --order <n> --item -`, with the card as JSON on stdin:

- `title`: what it decides, at most 80 characters.
- `question`, and 2 to 4 `options`, each with an `effect`, and `recommended` on yours.
- `details`: what it is, the evidence, why you differ from the flag comment if you do, and what
  changes on yes.
- `unblocks`: the issues it frees. `links`: its issues and PRs.

[parse-item-input.ts](../../../src/parse-item-input.ts) owns the shape. An invented example:

```json
{
  "title": "Keep the old export path or drop it? (GEO-9001)",
  "question": "Should the export keep its old path for one release, or drop it now?",
  "options": [
    {
      "label": "Keep it one release",
      "effect": "The old path redirects until the next release, then goes.",
      "recommended": true
    },
    { "label": "Drop it now", "effect": "The old path returns 404 from this release." }
  ],
  "details": [
    { "heading": "What it is", "text": "GEO-9001 moves the export to a new path." },
    {
      "heading": "Evidence",
      "text": "Two scripts call the old path.",
      "code": "grep -rn /export/old scripts/"
    }
  ],
  "unblocks": [{ "id": "GEO-9002", "title": "Remove the export shim" }],
  "links": [{ "label": "GEO-9001", "url": "https://linear.app/zgeoff/issue/GEO-9001" }]
}
```

hq keys a call on its id and question. Keep both the same between checks: a re-add updates in place
and sends nothing, while a new question on the same id is a new call. Ids:

- one issue: `GEO-9001`;
- a shared decision: `shared-<slug of the question>`, never built from its issues;
- a blocked decision: session and slug, such as `z-delivery-export-path`.

Close a call that no longer needs the owner with `hq call close <call id> --reason "<why>"`.

## Unblock list

For a step that needs the owner's hands, when its session hasn't filed it:
`hq unblock add --id <slug> --minutes <the owner's minutes> --unblocks <GEO-n:urgent|high|medium|low,…> --item -`,
with JSON `title` (80 characters at most), `question` (what the owner does), `details` and `links`.

- Give it each condition that ends it with `--done-when`: `issue:GEO-n`, `pr:<repo>#<n>`, or
  `doc:<Linear document ID>` (first line starts `Status: decided`). hq closes it and tells you.
- For a PR to review or merge, mark its link `"subject": true`, so hq drops the item when the PR
  closes. Mark one link at most.
- Before adding, look for signs it's done: a done item in `hq unblock list --state all`, a later
  Linear comment, or `hq typed list`. If so, add nothing, and message the evidence to the sender.
- Never re-add a done item to reword it: the re-add reopens it.
- `hq unblock drop <slug>` when the session says it's done. An item marked `· recheck` (open 3 days
  with no condition): check it, then `hq unblock done <id>` or
  `hq unblock done-when <id> <cond>...`.

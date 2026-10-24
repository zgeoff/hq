# the check

The check prepares the owner's decisions, one call for each open question, and queues the calls in `hq` for the main thread, `z-stu`. The questions come from three places: the issues the pass flags with `Needs Geoff`, the decisions that block other sessions and their agents, and the PRs that cite no issue. Every open item gets its call, with no cap. The check never sends anything to the owner and never applies an answer.

The check is the one channel for decisions. The delivery and review sessions message you each decision that blocks them, and file each step that needs the owner's hands with `hq unblock add` themselves; neither asks the owner directly. When a decision can't wait, the session messages you to check now.

Contents: [the queue and the state](#the-queue-and-the-state) · [the checklist](#the-checklist) · [calls](#calls) · [unblock list](#unblock-list)

## the queue and the state

The calls and the unblock list live in `hq`, and **Stu** works them there. Every `hq` command takes `--json`, and `hq` knows which session runs it. Never edit `hq`'s database by hand.

The check's saved state is `~/.local/share/z-sessions/refine.md`, which holds its "CHECK at <UTC time>" lines. The pass keeps its own lines in `triage.md`.

## the checklist

Copy this checklist into your notes, and tick each step as you finish it:

```text
- [ ] 1. Gather the blocked decisions into a file
- [ ] 2. Fetch the Needs Geoff issues, and save every page
- [ ] 3. Complete the notes file for the flags this pass did not set
- [ ] 4. Run untracked-prs.sh 2
- [ ] 5. Run build-queue.sh --calls, and prepare the calls
- [ ] 6. Add the calls and unblock items to hq, and close what's gone
- [ ] 7. Save the CHECK line, and delete your scratch files
```

1. **Gather the blocked decisions** into a JSON array in your scratch folder, one `{"question", "recommendation", "session", "issue"}` entry for each decision still open.

   A decision is open until the owner answers its call or its sender tells you it is settled, so keep each one in your saved state until then. Take them from two sources: the decisions other sessions sent you by message, and the `decision` and `blocked` notes in the atc events since the last "CHECK at" line. When `atc_events_read` refuses your saved cursor with `bad_args`, which follows an atc upgrade that changes the cursor format, read without a cursor, save the new one, and say in the check's line that notes from before that read may be missed. An item that needs the owner's hands rather than a decision, such as a live check, a design chat or a setup step, goes on the [unblock list](#unblock-list) instead.

2. **Fetch the flagged issues:** team GEO's issues with the label `Needs Geoff`, with the fields `id`, `title`, `url`, `status`, `priority`, `createdAt` and `updatedAt`. Save and audit every page as step 1 of the pass in `SKILL.md` says.
3. **Complete the notes file** for each flagged issue it lacks.

   The notes file maps each issue ID to its question and a one-sentence recommendation, such as `{"GEO-9001": {"question": "Split GEO-9001 into slices?", "recommendation": "Yes, because 16 PRs landed and it is open."}}`. The pass writes its own flags into it, so read the latest comment only on a flag it lacks: an older flag, one set by hand, or every flag when the check runs alone.

   When the comment holds no question that only the owner can answer, such as missing sections, a default `Code delivery` Action or a blocker the text names, fix the issue as step 4 of the pass says, remove `Needs Geoff`, and write `{"resolved": true}` as its note, so the script leaves it out. Only the owner answers an Action beyond Code delivery (Data that deletes or rewrites, Deploy, Infra, Credentials, or Paid API over its limit), scope, priority, closing, or a new project. For those, write the comment's question and recommendation, or your own recommendation when the comment has none. Which credentials belong to another session, and so are not his, is in this file's private half: read `skills/linear-triage/references/check.private.md` in the local hq-private clone (`hq defs` shows where it is) and follow it as part of this skill.

   When several issues wait on the same decision, such as creating one project, give them the same question text, word for word, so the script groups them into one call.

4. **Find the untracked PRs** with `scripts/untracked-prs.sh 2`, which lists the open PRs by `zgeoff` that cite no issue and those merged in the last 2 days. Trace each one to an issue, or close it as superseded.

   Before a PR becomes a call, search Linear for its repo and number: an issue may hold it as an attachment, which the script can't see. When an issue holds it, or the owner links one, add "Contributes to GEO-<n>" to the PR's description with `gh pr edit`, so later checks see the link.

5. **Build the calls** with `scripts/build-queue.sh --calls --blocked <file> --notes <file> --untracked <file> <issue pages>`. It prints every call as JSON in the order to send them. Prepare each one: read the issue, its comments and its linked work, and write the call as [calls](#calls) says. The untracked PRs make one call, of kind `untracked`, with their count by repo and your recommendation.
6. **Add the calls and the unblock items to `hq`.** Run `hq outbox flush --retry` first, so a message atc missed goes out. Re-add every call in the script's order, the open and put-off ones too, so their issues and order stay current. Close each call that is no longer in your gathered set, and drop each unblock item you added whose session has told you the step is done.

   `hq` sends the main thread "call ready" and "unblock list changed" itself, so you send neither. Report only your own calls, never other sessions' work or asks. A check with nothing new ends with one line, such as "<UTC time> check: nothing new."

7. **End the check.** Save the line "CHECK at <the check's UTC time>" in `refine.md`, and delete your scratch files and the pass's.

## calls

Add each prepared call with `hq call add <call id> --issues <GEO-n,…> --order <n> --item -`, where `<n>` is the call's place in the script's output. The JSON item on stdin is the card the console shows:

- `title`: what the call decides, at most 80 characters.
- `question`, and 2 to 4 `options`, each with its `effect`, and `recommended` on yours.
- `details`: what it is, the evidence, where your recommendation differs from triage's and why, and what changes on yes.
- `unblocks`: the issues it frees. `links`: its issues and PRs. A shared decision lists all its issues.

[parse-item-input.ts](../../../src/parse-item-input.ts) owns the item's shape. A made-up example:

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

Keep each call's id and question the same from check to check, because `hq` keys a call on both. A re-add with the same id and question updates its issues, text and order in place and sends nothing; a different question on the same id is a new call. The id is the issue ID for a call on one issue, `shared-<slug of its question>` for a shared decision, or the delivery session plus a short slug for a blocked decision. Never build a shared call's id from its issues, since an issue that joins it would make a new call. `hq` sends no "call ready" for a call that is open, put off and not yet due, or answered with the same question.

When a call no longer needs the owner, close it with `hq call close <call id> --reason "<why>"`. `hq` tells the main thread.

## unblock list

Add each item that reaches you by message or note and needs the owner's hands, when its session hasn't filed it already: `hq unblock add --id <slug> --minutes <N> --unblocks <GEO-n:priority,…> --item -`. The JSON item holds `title` (at most 80 characters), `question` (what he does), and `details` and `links` for the exact step.

- **A PR to review, lgtm or merge:** mark that PR's link `"subject": true`, as in `{"label": "widget#12", "url": "https://github.com/zgeoff/widget/pull/12", "subject": true}`, and `hq` drops the item within 10 minutes of the PR merging or closing. Mark at most one link, and leave a context link unmarked.
- **Before you add one:** look for a sign the step is done: a done item for the same issue in `hq unblock list --state all`, a later Linear comment, or a line in `hq typed list`. When one shows it done, add nothing, and message `z-delivery` the evidence so it drops the step.
- **Rewording:** never re-add a done item to reword it. A re-add keeps the item's added time and reopens a done item with the same slug.
- **Dropping:** run `hq unblock drop <slug>` when its session tells you the step is done, or its unmarked PR has merged.

Give each item the condition that ends it with `--done-when <cond>`, which repeats: `issue:GEO-n` (Done or Canceled), `pr:<repo>#<n>` (merged or closed), or `doc:<Linear document>` (its first line starts `Status: decided`). hq's watcher closes the item when one holds, and tells you, never the owner. Give an open item a condition with `hq unblock done-when <id> <cond>...`. An item that `hq unblock list` marks `· recheck` has been open over 3 days with no condition: check it yourself, then close it with `hq unblock done <id>` or give it a condition.

`hq` ranks the list by what each item unblocks: Urgent and High work first, then the most work unblocked.

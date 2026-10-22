# the check

The check gets the owner's decisions ready, as they come up, one prepared call each. **Triage** marks issues with the `Needs Geoff` label and a comment; agents raise blocked decisions as they go; and some PRs land with no issue at all. You gather them, prepare the calls, queue them in `hq`, and tell the main thread (`z-stu`) when one is ready. There is no cap: every open item gets its call.

The check is the one channel for decisions. The review session records each decision that blocks it under "Waiting on Geoff" in its saved state, and the delivery session sends you each one by message; neither asks the owner itself. When one can't wait, it messages you to check now.

The check never sends anything to the owner and never applies an answer.

## the queue and the state

The check adds prepared calls and unblock items to `hq`, the sessions' own command-line tool, and **Stu** works them there. Every `hq` command takes `--json`, and `hq` knows which session runs it. Never edit `hq`'s database by hand. The commands are under "calls" and "unblock list" below.

Your saved state for the check is `~/.local/share/z-sessions/refine.md`. It holds the "CHECK at <UTC time>" lines. The triage pass keeps its own lines in `triage.md`.

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

1. **Gather the blocked decisions.** Read the "Waiting on Geoff" section of the review session's saved state, `~/.local/share/z-sessions/review.md`, and each decision `z-delivery` sent you by message that is still open: one whose call the owner hasn't answered and that `z-delivery` hasn't since told you is settled. Keep these in your saved state until then. Also read the `decision` and `blocked` notes in the atc events since the last "CHECK at" line in your saved state. When `atc_events_read` refuses a saved cursor with `bad_args`, as atc 6 did with an atc 5 cursor, read without a cursor, save the new one, and say in the check's line that notes from before that read may be missed. For each decision still open, write one entry to a JSON array: `{"question", "recommendation", "session", "issue"}`. Save it to a file in your scratch folder. Put each item that needs the owner's hands, not a decision, such as a live check, a design chat or a setup step, on the unblock list instead.
2. **Fetch the flagged issues.** List team GEO's issues with the label `Needs Geoff`, with the fields `id`, `title`, `url`, `status`, `priority` and `updatedAt`. Save and audit every page as step 1 of the pass in `SKILL.md` says.
3. **Complete the notes file.** The notes file is the JSON object from issue ID to its question and its recommendation in one sentence, such as `{"GEO-135": {"question": "Split GEO-135 into slices?", "recommendation": "Yes, because 16 PRs landed and it is still open."}}`. The pass you just ran already wrote its own flags into it, so don't re-read their comments. A check on its own has no notes yet, so every flag takes this path. For each flagged issue the notes file lacks, an older flag or one set by hand, read its latest comment. When it holds no question only the owner can answer, such as missing sections, a default `Code delivery` Action or a blocker the text names, fix the issue as step 4 of the pass says, remove `Needs Geoff`, and write `{"resolved": true}` as its note, so the script leaves it out. Only he answers an Action beyond Code delivery (Data that deletes or rewrites, Deploy, Infra, Credentials outside a project vault, or Paid API over its limit), scope, priority, closing, or a new project; Credentials in a project vault are `z-delivery`'s, as step 7 of the pass says, so resolve such a flag as above; for those, add the comment's question and your recommendation. When several issues wait on the same decision, such as creating one project, give them the same question text, word for word, so the script groups them. When the comment has no recommendation, write your own.
4. **Find the untracked PRs.** Run `scripts/untracked-prs.sh 2`. It lists the PRs by `zgeoff` that cite no issue: every open one, and those merged in the last 2 days. Every other untracked PR is lost or in-flight work, so trace each one to an issue, or close it as superseded. Before a PR becomes a call, search Linear for its repo and number: an issue may already hold it as an attachment, which the script can't see. When one does, or when the owner links one, add "Contributes to GEO-<n>" to the PR's description with `gh pr edit`, so every later check sees the link.
5. **Build the calls.** Run `scripts/build-queue.sh --calls --blocked <file> --notes <file> --untracked <file> <issue pages>`. It prints every call as JSON, in the order to send them: each shared decision (a question 2 or more issues wait on), then the blocked decisions, then the single issues by priority. Prepare each call: read the issue, its comments and linked work, and write the call text described under "calls". Re-add every call in that order, the open and put-off ones too, so their issues and order stay current; `hq` never resends one that is open, put off, or answered with the same question. Untracked PRs make one call, which the script prints last as kind `untracked`, with their count by repo: write it with your recommendation.
6. **Add the calls and the unblock list to `hq`.** First run `hq outbox flush --retry`, so a message atc missed goes out. Add each call and unblock item as described below; `hq` messages the main thread when a call is ready. Close each open, queued or put-off call that is no longer in your gathered set, and drop each unblock item you added from "Waiting on Geoff" that has left it. `hq` also sends the main thread the morning "call ready" and "unblock list changed" from its watcher, so you send neither. A check with nothing new ends with one line, such as "<UTC time> check: nothing new." Report only your own calls, never other sessions' work or asks.
7. **End the check.** Save the line "CHECK at <the check's UTC time>" in `refine.md`. Delete your scratch files, the pass's too.

## calls

Add each prepared call with `hq call add <call id> --issues <GEO-n,…> --order <n> --item -`, where `<n>` is the call's place in the script's output, with the call as a JSON item on stdin that the console shows as a card: `title` (what it decides, at most 80 characters), `question`, 2 to 4 `options`, each with its `effect` and `recommended` on yours, and `details` for what it is, the evidence, where your recommendation differs from triage's and why, and what changes on yes. Add `unblocks` for the issues it frees and `links` for its issues and PRs. For a shared decision, list its issues. The `<call id>` is stable across checks: the issue ID for a call on one issue, `shared-<slug of its question>` for a shared decision, or the delivery session plus a short slug. Never build a shared call's id from its issues, since an issue that joins it would make a new call. Keep a call's question text the same across checks: a re-add then updates its issues, text and order in place, without a new message. Re-add every call each check: a re-add with the same id and question changes nothing, and a different question on the same id is a new call. `hq` messages the main thread "call ready" itself, and leaves out calls that are open, put off and not yet due, or answered with the same question.

The item's shape, as `src/parse-item-input.ts` in zgeoff/hq defines it, with invented text. Each `details` entry is a `{heading, text}` pair, with an optional `code`, and each `unblocks` entry is an `{id, title}` pair:

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
      "text": "Two scripts still call the old path.",
      "code": "grep -rn /export/old scripts/"
    }
  ],
  "unblocks": [{ "id": "GEO-9002", "title": "Remove the export shim" }],
  "links": [{ "label": "GEO-9001", "url": "https://linear.app/zgeoff/issue/GEO-9001" }]
}
```

When a call no longer needs the owner, close it with `hq call close <call id> --reason "<why>"`. `hq` tells the main thread.

## unblock list

Add each item from "Waiting on Geoff" that needs the owner's hands, not a decision, such as a live check, a design chat or a setup step: `hq unblock add --id <slug> --minutes <N> --unblocks <GEO-n:priority,…> --item -`, with a JSON item on stdin: `title` (at most 80 characters), `question` (what to do), and `details` and `links` for the exact step. When the item asks the owner to review, lgtm or merge a PR, mark that PR's link `"subject": true`, as in `{"label": "cloud#399", "url": "https://github.com/zgeoff/cloud/pull/399", "subject": true}`: `hq` drops the item within 10 minutes of the PR merging or closing. Mark one GitHub PR link at most, and leave a context link unmarked. Before you add one, look for a done item for the same issue in `hq unblock list --state all`, a later Linear comment that shows the step done, or a line in `hq typed list`. When one shows the step done, don't add the item: message `z-delivery` the evidence so it removes the line. A re-add keeps the item's added time, and reopens a done item with the same slug: never re-add a done item to reword it. When an item leaves "Waiting on Geoff", or its unmarked PR has merged, drop it with `hq unblock drop <slug>`. `hq` ranks the list by what it unblocks: Urgent and High work first, then the most work unblocked.

Give each item the condition that ends it, with `--done-when <cond>` (repeatable): `issue:GEO-n` (Done or Canceled), `pr:<repo>#<n>` (merged or closed), or `doc:<Linear document>` (its first line starts `Status: decided`). hq's watcher closes the item when one holds and tells you, never the owner. Give an open item a condition with `hq unblock done-when <id> <cond>...`. An item `hq unblock list` marks `· recheck`, open over 3 days with no condition: check it yourself, then close it with `hq unblock done <id>`, or give it a condition.

#!/usr/bin/env bash
# Pairs open issues that may duplicate, overlap or conflict with each other, from saved pages of
# Linear issues, and prints the strongest pairs for the model to read in full.
# Open means Backlog, Ready, In Progress or In Review. Two issues pair when they share a project,
# or an area label (any label outside the Type and Size groups, other than Needs Geoff, quality, enabler and process).
# The score is the share of title words they have in common, out of the shorter title, after stop
# words and a leading "<repo or area>:" prefix are dropped, plus 0.2 for each file path or backticked
# command that both descriptions (or titles) name, at most 0.6. Links, URLs, issue ids and the
# issue list's truncation note are dropped first, since they name nothing the issue is about.
# Title words alone don't count for siblings made from one template: two titles with different
# prefixes, such as "atc:" and "impz:", or titles that differ by 1 to 3 words on each side when
# every differing word is a template slot: a file path or name, an identifier (camelCase,
# snake_case, kebab-case with a digit, or backticked), a number or version, a GEO id, a repo name,
# or a package name (scoped, or next to "override", "dependency", "package", "pin", "bump" or
# "upgrade"). So "split read-schema.ts" and "split imps.ts" are siblings, and "drop the hono
# override" and "drop the qs override" are too, but two titles that differ by ordinary words, such
# as "keep queued messages" and "keep unanswered messages", still pair. Titles made from one frame
# are siblings too: after the prefix and any "(...)" aside are dropped, the same words in the same
# order but for 1 or 2 single words, each between words the two titles share, and never the first
# word or a verb. So "add a docs check to X" and "add a commits check (commitlint) to X" are
# siblings, but "drop the hono exclude" and "keep the hono exclude" still pair. Shared references count.
# A pair already joined by a blocks, related or duplicate relation, in a --relations file, never prints,
# nor a parent and its sub-issue (one's parentId, or parent id, is the other).
# A pair prints when its score is at least the threshold, 0.8 unless --threshold sets it, and it
# shares 2 title words or 1 such reference.
# With --rollouts, it prints only the siblings that make one change in different repos: two titles
# with different repo prefixes, or whose differing words include a repo name. These pair across
# projects and areas, and score the share of title words they have in common, as other pairs do
# before the sibling rule, so the triage pass can fold them into one umbrella issue. Two sub-issues
# of one parent never print there: the parent already holds the rollout.
# Prints at most 15 pairs, strongest first, one per line, tab-separated:
#   <older id> <newer id> <score> <shared terms>
# where the older id is the lower number. The count of pairs above the threshold goes to stderr.
# Usage: overlap-candidates.sh [--judged <tsv>] [--relations <issue JSON>]... [--threshold <n>] [--rollouts] <issues JSON>...
# Each file is one page of a Linear issue list, as audit-issues.sh reads, with id, title, status,
# project and labels, and description when the pass fetched it. The judged file holds one pair per
# line, tab-separated: <older id> <newer id> <verdict> <date>; a pair in it is never printed again.
# A relations file that doesn't exist yet links nothing. One holds issues as Linear's get_issue returns them with relations, one object or a
# list: {id, relations: {blocks, blockedBy, relatedTo, duplicateOf}}, each an issue or list of them.
# Needs jq.
set -euo pipefail

usage="usage: overlap-candidates.sh [--judged <tsv>] [--relations <issue JSON>]... [--threshold <n>] [--rollouts] <issues JSON>..."
judged=/dev/null
relations=()
threshold=0.8
rollouts=false
while [ $# -gt 0 ]; do
  case $1 in
    --judged)
      judged=${2:?$usage}
      shift 2
      [ -e "$judged" ] || judged=/dev/null
      ;;
    --relations)
      [ ! -e "${2:?$usage}" ] || relations+=("$2")
      shift 2
      ;;
    --threshold)
      threshold=${2:?$usage}
      shift 2
      ;;
    --rollouts)
      rollouts=true
      shift
      ;;
    *) break ;;
  esac
done
[ $# -gt 0 ] || { echo "$usage" >&2; exit 2; }
links=$(if [ ${#relations[@]} -gt 0 ]; then jq -cs '[.[] | if type == "array" then .[] else . end]' "${relations[@]}"; else echo '[]'; fi)

unwrap='def unwrap:
    if type == "array" and length > 0 and (.[0] | type == "object" and has("text")) then .[0].text | fromjson | unwrap
    elif type == "object" and has("issues") then .issues
    elif type == "array" then .
    else error("unrecognised page shape") end;'
# Name the file a page shape is refused for, since the slurped run below can't.
for page in "$@"; do
  jq -e "$unwrap"' unwrap | type == "array"' "$page" > /dev/null 2>&1 \
    || { echo "overlap-candidates.sh: $page: unrecognised page shape" >&2; exit 1; }
done

jq -rs --rawfile judged "$judged" --argjson links "$links" --argjson threshold "$threshold" --argjson rollouts "$rollouts" "$unwrap"'
  def stop: ["the", "and", "for", "from", "with", "into", "onto", "that", "this", "when", "not", "its",
    "per", "out", "all", "one", "via", "use", "add", "make", "new", "are", "can", "has", "have", "but",
    "to", "of", "in", "on", "at", "by", "an", "is", "it", "be", "as", "or", "if", "no", "so", "up", "do"];
  def unclassified: ["Bug", "Feature", "Improvement", "Chore", "Design", "Investigation",
    "S", "M", "L", "XL", "Needs Geoff", "quality", "enabler", "process"];
  def labelNames: (.labels // []) | map(if type == "object" then .name else . end);
  def projectName: .project | if type == "object" then .name else . end;
  def num: ltrimstr("GEO-") | tonumber;
  def prefix: ascii_downcase | capture("^(?<p>[a-z0-9-]+):").p // null;
  # Text that names nothing an issue is about, dropped before scoring: issue and PR link tags with
  # their text, Markdown link targets (the link text stays), URLs, bare linear.app and github.com
  # paths, issue ids such as GEO-12 or nixie#34, and the truncation note of the issue list.
  def clean:
    gsub("<(issue|pull-request)[^>]*>[^<]*</(issue|pull-request)>"; " ")
    | gsub("\\]\\(<?[^)>\\s]*>?\\)"; "]")
    | gsub("[A-Za-z][A-Za-z0-9+.-]*://[^\\s)>\\]]*"; " ")
    | gsub("\\b(linear\\.app|github\\.com)/[^\\s)>\\]]*"; " "; "i")
    | gsub("…?\\s*\\(truncated[^)]*\\)"; " ")
    | gsub("\\bgeo-[0-9]+\\b"; " "; "i")
    | gsub("\\b[a-z][a-z0-9_.-]*#[0-9]+\\b"; " "; "i");
  def words: clean | ascii_downcase | sub("^[a-z0-9-]+:\\s*"; "")
    | [splits("[^a-z0-9]+") | select((length >= 2 or test("^[0-9]+$")) and (IN(stop[]) | not))] | unique;
  def refs: ascii_downcase
    | [ (scan("`([^`\n]{3,80})`") | .[0]),
        (scan("[a-z0-9_.-]*/[a-z0-9_./-]*\\.[a-z0-9]+")) ] | unique;
  def round2: . * 100 | round / 100;
  def repos: ["atc", "imp", "impz", "nixie", "nixie-definitions", "cloud", "tools", "hq", "vers",
    "dotfiles", "noslop", "auto-mode", "auto-mode-evals"];
  def pkgNext: ["override", "overrides", "dependency", "dependencies", "package", "pin"];
  def pkgPrev: ["bump", "upgrade", "pin"];
  # Title tokens after the prefix, in order, as {raw, key}: raw keeps case and backticks, key is
  # the lowercase token with outer punctuation trimmed.
  def tokens: sub("^[A-Za-z0-9-]+:\\s*"; "") | [splits("\\s+") | select(length > 0)
    | {raw: ., key: (ascii_downcase | gsub("^[\\(\\[\"`,;:!?]+|[\\)\\]\"`,;:!?.]+$"; ""))}
    | select(.key != "" and (.key | IN(stop[]) | not))];
  def isSlot($prev; $next):
    .raw as $r | .key as $k
    | ($r | test("^`"))
      or ($k | test("/"))
      or ($k | test("^[a-z0-9_-]+\\.[a-z0-9]{1,5}$"))
      or ($r | test("[a-z][A-Z]"))
      or ($k | test("_"))
      or ($k | test("-") and test("[0-9]"))
      or ($k | test("^v?[0-9][0-9.x]*$"))
      or ($k | test("^geo-[0-9]+$"))
      or ($k | IN(repos[]))
      or ($k | test("^@"))
      or ($next | IN(pkgNext[])) or ($prev | IN(pkgPrev[]));
  # The tokens of $a whose key $b lacks, each judged a slot or not by its neighbours in $a.
  def differing($a; $b): [$b[].key] as $keys
    | [range(0; $a | length) as $i | $a[$i] | select(.key | IN($keys[]) | not)
        | isSlot(($a[$i - 1].key // "") | if $i == 0 then "" else . end; $a[$i + 1].key // "")];

  # The same title, word for word, after the prefix and any "(...)" aside are dropped.
  def frame: sub("^[A-Za-z0-9-]+:\\s*"; "") | gsub("\\([^)]*\\)"; " ") | ascii_downcase
    | [splits("\\s+") | gsub("^[\"`,;:!?]+|[\"`,;:!?.]+$"; "") | select(length > 0)];
  def verbs: ["add", "drop", "remove", "keep", "move", "split", "fix", "rename", "make", "stop",
    "start", "allow", "block", "skip", "show", "hide", "run", "use", "replace", "merge", "delete",
    "create", "close", "open", "send", "read", "write", "set", "unset", "enable", "disable"];
  # A slot sits where a name goes: after an article or preposition, or it reads as a name itself.
  # A verb such as "accept" against "reject" after "the parser" or "to" is a real difference, not a slot.
  def slotLead: ["a", "an", "the", "its", "for", "in", "of", "on", "from", "with", "per"];
  def nameLike: test("[-./@_0-9]");
  # True when $a and $b are one frame with 1 or 2 single words changed, each between shared words
  # and each in a slot.
  def sameFrame($a; $b):
    ($a | length) == ($b | length) and ($a | length) >= 4
    and ([range(0; $a | length) | select($a[.] != $b[.])] as $d
      | ($d | length) >= 1 and ($d | length) <= 2
        and ($d | all(. > 0 and $a[. - 1] == $b[. - 1] and (. == ($a | length) - 1 or $a[. + 1] == $b[. + 1])
          and ($a[.] | IN(verbs[]) | not) and ($b[.] | IN(verbs[]) | not)
          and (($a[. - 1] | IN(slotLead[])) or (($a[.] | nameLike) and ($b[.] | nameLike))))));

  ($judged | split("\n") | map(split("\t") | select(length >= 2) | "\(.[0])\t\(.[1])")) as $seen
  | [ $links[] | .id as $x | (.relations // {}) | .[]? | (if type == "array" then .[] else . end)
      | objects | .id | strings | [$x, .] | sort_by(ltrimstr("GEO-") | tonumber) | "\(.[0])\t\(.[1])" ] as $linked
  | (map(unwrap) | add | unique_by(.id)
      | map(select((.status // "") | IN("Backlog", "Ready", "In Progress", "In Review")))
      | map({
          id, n: (.id | num), project: projectName, prefix: (.title | prefix),
          parent: (.parentId // (.parent | if type == "object" then (.identifier // .id) else . end)),
          areas: [labelNames[] | select(IN(unclassified[]) | not)],
          words: (.title | words), tokens: (.title | tokens), frame: (.title | frame),
          refs: ((.title + "\n" + (.description // "")) | clean | refs)
        })
      | sort_by(.n)) as $issues
  | [ range(0; $issues | length) as $i | range($i + 1; $issues | length) as $j
      | $issues[$i] as $a | $issues[$j] as $b
      | select($rollouts or ($a.project != null and $a.project == $b.project)
          or ([$a.areas[] | select(IN($b.areas[]))] | length > 0))
      | select("\($a.id)\t\($b.id)" | IN($seen[]) or IN($linked[]) | not)
      | select($a.parent != $b.id and $b.parent != $a.id)
      | [$a.words[] | select(IN($b.words[]))] as $shared
      | [$a.refs[] | select(IN($b.refs[])) | select(. != ($a.id | ascii_downcase) and . != ($b.id | ascii_downcase))] as $sharedRefs
      | ([$a.words, $b.words | length] | min) as $shorter
      | differing($a.tokens; $b.tokens) as $onlyA
      | differing($b.tokens; $a.tokens) as $onlyB
      | (($a.prefix != null and $b.prefix != null and $a.prefix != $b.prefix)
          or (($onlyA | length) >= 1 and ($onlyA | length) <= 3 and ($onlyB | length) >= 1 and ($onlyB | length) <= 3
              and ($shared | length) >= 1 and ($onlyA + $onlyB | all))
          or sameFrame($a.frame; $b.frame)) as $siblings
      | (($a.prefix != null and $b.prefix != null and $a.prefix != $b.prefix)
          or ([$a.tokens[], $b.tokens[] | .key] - [$a.tokens[] | .key | select(IN([$b.tokens[] | .key][]))]
              | any(IN(repos[])))) as $crossRepo
      | select(($rollouts | not) or ($siblings and $crossRepo and ($a.parent == null or $a.parent != $b.parent)))
      | ((if $shorter == 0 or ($siblings and ($rollouts | not)) then 0 else ($shared | length) / $shorter end)
          + ([0.2 * ($sharedRefs | length), 0.6] | min) | round2) as $score
      | select($score >= $threshold and ((($shared | length) >= 2 and ($rollouts or ($siblings | not))) or ($sharedRefs | length) >= 1))
      | {a: $a.id, b: $b.id, score: $score, terms: ($shared + $sharedRefs)} ]
  | sort_by(-.score, (.a | num), (.b | num))
  | ("\(length) pair(s) above the threshold\n" | stderr) as $_
  | .[:15][]
  | "\(.a)\t\(.b)\t\(.score)\t\(.terms | join(", "))"
' "$@"

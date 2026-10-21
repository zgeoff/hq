# A missing answer requests one read-only gh call, or `hq version --json`. Bash fetches or
# replays it, then reruns us.
.answers as $answers
| def answer($key; $args):
    if $answers | has($key) then $answers[$key]
    else error({key: $key, args: $args}) end;
  def answer($key; $cmd; $args):
    if $answers | has($key) then $answers[$key]
    else error({key: $key, cmd: $cmd, args: $args}) end;
  def compare($repo; $base; $head):
    ($base | @uri) as $base | ($head | @uri) as $head
    | answer("\($repo).compare-\($base)...\($head)";
        ["api", "repos/zgeoff/\($repo)/compare/\($base)...\($head)"])
    | .status as $status
    | if $status | IN("ahead", "identical") then true
      elif $status | IN("behind", "diverged") then false
      else error("unrecognised comparison status: \($status)") end;
  def one($pattern):
    [capture($pattern; "g").value]
    | if length == 1 then .[0] else error("expected exactly one production pin") end;
  def pin($repo):
    ({nixie: "infra/Pulumi.prod.yaml", atc: "nixos/packages/atc.nix",
      impz: "nixos/flake.nix", "auto-mode": "images/agent/Dockerfile"}[$repo]) as $file
    | answer("cloud.pin-\($repo)";
        ["api", "repos/zgeoff/cloud/contents/\($file)?ref=main"])
    | (.content | gsub("\\s"; "") | @base64d) as $text
    | ($text | if $repo == "nixie" then
        capture("(?m)^(?<indent> *)geoff-cloud:nixie: *\n(?<body>(?:^\\k<indent> +[^\n]*(?:\n|$))*)").body
        | one("(?m)^ *image: *[\"']?ghcr\\.io/zgeoff/nixie:(?<value>[^@\\s\"']+)@sha256:") | "v" + .
      elif $repo == "atc" then
        one("(?m)^ *version *= *\"(?<value>[^\"]+)\";") | "@zgeoff/atc@" + .
      elif $repo == "impz" then
        capture("(?m)^ *imp *= *\\{(?<body>[^}]+)\\}").body
        | one("url *= *\"github:zgeoff/impz/(?<value>[0-9a-fA-F]{7,40})\";")
      else
        one("(?m)^ARG AUTO_MODE_VERSION=(?<value>[^\\s]+)$") | "auto-mode-v" + .
      end) as $ref
    | {pinned: $ref, pinFile: $file};
  def release($repo; $merge; $prefix):
    answer("\($repo).releases";
      ["api", "--paginate", "--slurp", "repos/zgeoff/\($repo)/releases?per_page=100"])
    # GitHub's order isn't chronological, so sort oldest first by creation time.
    # Never infer ancestry from versions.
    | [ .[][] | select(.draft != true) ] | sort_by(.created_at) | map(.tag_name)
    | map(select(startswith($prefix)))
    | first(.[] | select(compare($repo; $merge; .))) // null;
  def release($repo; $merge): release($repo; $merge; "");
  # The release-please packages a PR changes, each with the tag prefix its releases carry.
  def changed_packages($repo; $number; $merge):
    answer("\($repo).release-config-\($merge)";
      ["api", "repos/zgeoff/\($repo)/contents/release-please-config.json?ref=\($merge)"])
    | (.content | gsub("\\s"; "") | @base64d | fromjson | .packages | to_entries
        | map({path: .key, tag: ((.value.component // .value["package-name"]) + "@")})) as $packages
    | answer("\($repo).files-\($number)";
        ["pr", "view", $number, "-R", "zgeoff/\($repo)", "--json", "files"])
    | [.files[].path] as $files
    | $packages | map(. as $p | select($p.path == "." or any($files[]; startswith($p.path + "/"))));
  def check:
    . as $pr
    | capture("^(?<repo>[A-Za-z0-9_.-]+)#(?<number>[1-9][0-9]*)$") as $id
    | $id.repo as $repo
    | answer("\($repo).pr-\($id.number)";
        ["pr", "view", $id.number, "-R", "zgeoff/\($repo)", "--json", "mergeCommit,mergedAt,state"]) as $info
    | {pr: $pr, merged: ($info.state == "MERGED"), mergedAt: $info.mergedAt,
        release: null, pinned: null, pinFile: null} as $base
    | if $base.merged | not then $base + {deployed: false, reason: "not merged"}
      elif $repo | IN("cloud", "vers") then
        $base + {deployed: true, reason: (if $repo == "cloud" then
          "deploys on merge; a failed deploy-prod run would make this wrong"
          else "deploys on merge" end)}
      elif $repo | IN("nixie", "atc", "impz", "auto-mode") then
        (pin($repo) // error("production pin not found for \($repo)")) as $pin
        | ($info.mergeCommit.oid // error("missing merge commit for \($pr)")) as $merge
        | release($repo; $merge) as $release
        | $base + $pin + {release: $release}
        + (if $release == null then {deployed: false, reason: "not released yet"}
           elif compare($repo; $release; $pin.pinned) then
             {deployed: true, reason: "production pin contains release"}
           else {deployed: false, reason: "production pin does not contain release"} end)
      elif $repo | IN("tools", "noslop") then
        # No production pin: the live change is a published release of each package the PR
        # changes that contains the merge. A PR that changes no package needs any such release.
        ($info.mergeCommit.oid // error("missing merge commit for \($pr)")) as $merge
        | changed_packages($repo; $id.number; $merge) as $packages
        | if $packages == [] then
            release($repo; $merge) as $release
            | $base + {release: $release}
            + (if $release == null then {deployed: false, reason: "not released yet"}
               else {deployed: true, reason: "published release contains merge"} end)
          else
            [$packages[] | {tag, release: release($repo; $merge; .tag)}] as $found
            | [$found[] | select(.release == null) | .tag | rtrimstr("@")] as $missing
            | $base + {release: ([$found[].release | values] | join(", ") | if . == "" then null else . end)}
            + (if $missing == [] then {deployed: true, reason: "a published release of each changed package contains merge"}
               else {deployed: false, reason: "not released yet: \($missing | join(", "))"} end)
          end
      elif $repo == "hq" then
        # hq runs from the binary installed on this host, so the live change is a build
        # whose commit contains the merge. A build from source or a dirty tree is unknown.
        ($info.mergeCommit.oid // error("missing merge commit for \($pr)")) as $merge
        | answer("hq.version"; "hq"; ["version", "--json"]) as $installed
        | $base + {release: ($installed.version // null)}
        + (if $installed.commit == null or $installed.dirty != false then
             {deployed: null, reason: "installed hq build commit unknown"}
           elif compare($repo; $merge; $installed.commit) then
             {deployed: true, reason: "installed hq contains merge"}
           else {deployed: false, reason: "installed hq does not contain merge yet"} end)
      else $base + {deployed: null, reason: "no known pin"} end;
  try (
    if all(.prs[]; test("^[A-Za-z0-9_.-]+#[1-9][0-9]*$")) | not then
      error("expected PRs as repo#n in the zgeoff org")
    else {result: {checkedAt: .now, prs: [.prs[] | check]}} end
  ) catch if type == "object" and has("key") then {fetch: .} else error(.) end

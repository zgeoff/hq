#!/bin/sh
# Invented gh answers exercise release ancestry, all production pins and merge-only repos.
set -eu
here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
fixtures="$here/testdata/release-deployed"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' 0
trap 'exit 1' HUP INT TERM
export TMPDIR="$tmp"
fail=0

# Offline tests must never call gh, even when a saved answer is missing.
mkdir "$tmp/bin"
cat > "$tmp/bin/gh" <<'SH'
#!/bin/sh
echo 'unexpected gh call' >&2
exit 99
SH
chmod +x "$tmp/bin/gh"
PATH="$tmp/bin:$PATH"
export PATH

if bash "$here/release-deployed.sh" --now 2026-10-16T00:00:00Z --from "$fixtures" \
    nixie#101 atc#201 nixie#102 impz#301 cloud#401 nixie#103 nixie#104 tools#601 \
    auto-mode#501 vers#402 nixie#105 nixie#101 noslop#701 hq#801 tools#602 hq#802 > "$tmp/actual" 2> "$tmp/stderr"; then
  if diff -u "$fixtures/mixed.expected" "$tmp/actual"; then
    printf 'ok release-deployed mixed\n'
  else
    printf 'FAIL release-deployed: output differs\n'
    fail=1
  fi
else
  printf 'FAIL release-deployed: script exited non-zero\n'
  cat "$tmp/stderr"
  fail=1
fi

reject() {
  name=$1
  expected=$2
  shift 2
  if bash "$here/release-deployed.sh" "$@" > "$tmp/actual" 2> "$tmp/stderr"; then
    printf 'FAIL %s: expected a non-zero exit\n' "$name"
    fail=1
  elif [ -s "$tmp/actual" ] || grep -q 'unexpected gh call' "$tmp/stderr"; then
    printf 'FAIL %s: partial output or network access\n' "$name"
    fail=1
  elif ! grep -q "$expected" "$tmp/stderr"; then
    printf 'FAIL %s: unexpected error\n' "$name"
    cat "$tmp/stderr"
    fail=1
  else
    printf 'ok %s\n' "$name"
  fi
}

reject missing-answer 'nixie.pr-101.json' --from "$tmp" nixie#101
reject invalid-pr 'expected PRs' --from "$fixtures" zgeoff/nixie#101
reject no-prs 'usage:' --from "$fixtures"
reject missing-option-value 'usage:' --now
reject unknown-option 'usage:' --unknown nixie#101

# A damaged known pin must fail, rather than report an unknown or deployed result.
cp "$fixtures/atc.pr-201.json" "$tmp/atc.pr-201.json"
printf '{"content":""}\n' > "$tmp/cloud.pin-atc.json"
reject missing-pin 'expected exactly one production pin' --from "$tmp" atc#201
cp "$fixtures/cloud.pin-atc.json" "$tmp/cloud.pin-atc.json"
cp "$fixtures/atc.releases.json" "$tmp/atc.releases.json"
printf '{"status":"unexpected"}\n' > "$tmp/atc.compare-6666666666666666666666666666666666666666...%40zgeoff%2Fatc%409.80.0.json"
reject invalid-comparison 'unrecognised comparison status' --from "$tmp" atc#201

# An hq build from source or a dirty tree gives no commit to compare, so the result is unknown.
for version in '{"version":"9.40.0","commit":null,"dirty":false}' '{"version":"9.40.0","commit":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","dirty":true}'; do
  cp "$fixtures/hq.pr-801.json" "$tmp/hq.pr-801.json"
  printf '%s\n' "$version" > "$tmp/hq.version.json"
  if bash "$here/release-deployed.sh" --now 2026-10-16T00:00:00Z --from "$tmp" hq#801 > "$tmp/actual" 2> "$tmp/stderr" \
      && [ "$(jq -c '.prs[0] | [.deployed, .reason]' "$tmp/actual")" = '[null,"installed hq build commit unknown"]' ]; then
    printf 'ok release-deployed hq unknown build\n'
  else
    printf 'FAIL release-deployed: hq unknown build\n'
    cat "$tmp/stderr"
    fail=1
  fi
done
exit "$fail"

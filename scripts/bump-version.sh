#!/bin/bash
# Usage: ./scripts/bump-version.sh v69
#
# Bumps the version string baked into the .amxd devices. The version lives ONLY
# in the patchers (4 copies each: the live.comment label + 3 message boxes that
# feed it out); [v8] receives it at runtime via setDeviceVersion, so there is
# nothing to change in src/.
#
# Edits go through scripts/amxd.py (unpack -> raw-text replace -> pack) so the
# binary header is copied verbatim and the JSON length field is patched for us.
# A raw string replace keeps the diff surgical — bumping v68 -> v69 touches
# exactly 4 bytes per device.

set -e

NEW="$1"
if [ -z "$NEW" ]; then
  echo "Usage: $0 <version>  (e.g. $0 v69)"
  exit 1
fi

case "$NEW" in
  v[0-9]*) ;;
  *) echo "ERROR: version must look like v69, got '$NEW'"; exit 1 ;;
esac

cd "$(dirname "$0")/.."

DEVICES=(Project/Knobbler4.amxd Project/Knobbler4-P3SA.amxd)

for d in "${DEVICES[@]}"; do
  if [ ! -f "$d" ]; then
    echo "ERROR: $d not found"
    exit 1
  fi
done

# Current version, read out of the main device.
CUR=$(grep -ao "Knobbler4-v[0-9]*" "${DEVICES[0]}" | sort -u | head -1)
if [ -z "$CUR" ]; then
  echo "ERROR: no Knobbler4-v<N> string found in ${DEVICES[0]}"
  exit 1
fi

if [ "$CUR" = "Knobbler4-$NEW" ]; then
  echo "Already at Knobbler4-$NEW — nothing to do."
  exit 0
fi

# Fail HERE rather than at release time: scripts/release.sh hard-requires a
# [vNN] changelog entry, and finding that out after freezing devices is worse.
if ! grep -q "\[$NEW\]" README.md; then
  echo "ERROR: No changelog entry for [$NEW] in README.md — add it first."
  exit 1
fi

echo "Bumping $CUR -> Knobbler4-$NEW"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

for d in "${DEVICES[@]}"; do
  json="$TMP/$(basename "$d").json"
  python3 scripts/amxd.py unpack "$d" "$json" >/dev/null
  python3 - "$json" "$CUR" "Knobbler4-$NEW" <<'PY'
import sys
path, cur, new = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path).read()
n = s.count(cur)
if n == 0:
    sys.exit("ERROR: %s not found in %s" % (cur, path))
open(path, 'w').write(s.replace(cur, new))
print("  %s: %d occurrence(s)" % (path.split('/')[-1], n))
PY
  python3 scripts/amxd.py pack "$json" "$d" >/dev/null
  echo "  wrote $d"
done

echo ""
echo "Now at:"
for d in "${DEVICES[@]}"; do
  printf "  %-32s %s\n" "$d" "$(grep -ao "Knobbler4-v[0-9]*" "$d" | sort -u | tr '\n' ' ')"
done
echo ""
echo "Next: reload the device in Live to confirm, then freeze into frozen/ and run scripts/release.sh $NEW"

#!/bin/bash
# Usage: ./scripts/release.sh v56
# Creates a release zip after verifying README.md entry and frozen devices exist.

set -e

VERSION="$1"
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>  (e.g. $0 v56)"
  exit 1
fi

cd "$(dirname "$0")/.."

# Check README.md has an entry for this version
if ! grep -q "\[$VERSION\]" README.md; then
  echo "ERROR: No entry for $VERSION found in README.md"
  exit 1
fi

# Check frozen devices exist
DEVICES=(frozen/Knobbler4*-${VERSION}.amxd)
if [ ${#DEVICES[@]} -eq 0 ] || [ ! -f "${DEVICES[0]}" ]; then
  echo "ERROR: No frozen devices found matching frozen/Knobbler4*-${VERSION}.amxd"
  exit 1
fi

echo "Found ${#DEVICES[@]} device(s):"
printf "  %s\n" "${DEVICES[@]}"

# Check README.txt exists
if [ ! -f frozen/README.txt ]; then
  echo "ERROR: frozen/README.txt not found"
  exit 1
fi

# Create zip
ZIPNAME="Knobbler4-${VERSION}.zip"
zip -j "$ZIPNAME" frozen/README.txt "${DEVICES[@]}"

echo ""
echo "Created $ZIPNAME"
echo "Contents:"
unzip -l "$ZIPNAME"

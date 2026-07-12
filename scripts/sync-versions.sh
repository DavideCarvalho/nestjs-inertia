#!/bin/sh
# Only the packages that export a VERSION const from src/index.ts —
# cli and codegen-extension deliberately have none.
for pkg in core vite testing client; do
  VER=$(grep '"version"' "packages/$pkg/package.json" | head -1 | grep -oP '[\d.]+')
  sed -i "s/VERSION = '[^']*'/VERSION = '$VER'/" "packages/$pkg/src/index.ts"
done

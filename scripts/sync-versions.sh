#!/bin/sh
# Only the packages that export a VERSION const from src/index.ts —
# cli and codegen-extension deliberately have none.
for pkg in core vite testing client; do
  VER=$(node -p "require('./packages/$pkg/package.json').version")
  sed -i "s/VERSION = '[^']*'/VERSION = '$VER'/" "packages/$pkg/src/index.ts"
done

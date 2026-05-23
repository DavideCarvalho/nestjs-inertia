#!/bin/sh
for pkg in core vite testing codegen client; do
  VER=$(grep '"version"' "packages/$pkg/package.json" | head -1 | grep -oP '[\d.]+')
  sed -i "s/VERSION = '[^']*'/VERSION = '$VER'/" "packages/$pkg/src/index.ts"
done

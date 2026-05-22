#!/usr/bin/env node
import('../dist/cli/main.js').then((m) => m.run(process.argv.slice(2)));

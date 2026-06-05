---
'@dudousxd/nestjs-inertia': patch
---

Log a "Codegen auto-watch will start after application bootstrap" hint during module init in dev mode. The auto-watch only starts in `onApplicationBootstrap`, so a boot that stalls mid-init previously produced no codegen output with zero trace of why; the early hint makes a stalled boot diagnosable from the log. Also documents the symptom in the README troubleshooting section.

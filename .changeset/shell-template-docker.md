---
'@dudousxd/nestjs-inertia-codegen': minor
---

init: configure nest-cli.json to copy shell template to dist/ and use resolve(__dirname) for rootView so Docker images that only ship dist/ include the template. doctor: validate shell template exists and nest-cli.json asset config is present.

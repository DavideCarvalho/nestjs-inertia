---
"@dudousxd/nestjs-inertia": minor
---

Multi-app: serve a scope under a path prefix, and give each scope its own asset version.

- `vite.base` (forRoot and forFeature): the public URL prefix of the app's Vite build, the same
  value as Vite's `base`. `@vite` and `@asset` emit `<base><file>` instead of root-absolute
  `/<file>` (and `<base>@vite/client`, `<base>@react-refresh`, `<base><entry>` in development),
  so an app mounted at `/m` builds with `base: '/m/'` instead of writing its assets into an
  `m/assets` directory. Normalized to start and end with `/`; a full (CDN) URL is kept.
  `FileBasedShellRenderer` takes it as `new FileBasedShellRenderer(path, { base })`.
- A `forFeature` scope without an explicit `version` now gets its own asset version: the
  computed one mixed with the scope name. Before, in development (no manifest) every scope fell
  back to the same package-version hash as forRoot, so an Inertia visit from one app to another
  was not answered with a 409 and tried to render the other app's page in the wrong client.
  An explicit `version` is unchanged.

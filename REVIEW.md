---
phase: code-review
reviewed: 2026-05-24T12:00:00Z
depth: deep
files_reviewed: 45
files_reviewed_list:
  - packages/core/src/csrf/csrf.guard.ts
  - packages/core/src/csrf/csrf-token.ts
  - packages/core/src/csrf/csrf-cookie.interceptor.ts
  - packages/core/src/shell/shell.ts
  - packages/core/src/shell/directives.ts
  - packages/core/src/shell/serialize-page.ts
  - packages/core/src/shell/file-shell.renderer.ts
  - packages/core/src/shell/template-engine.registry.ts
  - packages/core/src/helpers/escape-html.ts
  - packages/core/src/helpers/set-nested.ts
  - packages/core/src/helpers/nullify-undefined.ts
  - packages/core/src/helpers/suppress-post-send-writes.ts
  - packages/core/src/service.ts
  - packages/core/src/module.ts
  - packages/core/src/tokens.ts
  - packages/core/src/types.ts
  - packages/core/src/markers.ts
  - packages/core/src/adapter/adapter.ts
  - packages/core/src/adapter/express.ts
  - packages/core/src/adapter/fastify.ts
  - packages/core/src/middleware/express.middleware.ts
  - packages/core/src/middleware/fastify.middleware.ts
  - packages/core/src/middleware/method-spoof.middleware.ts
  - packages/core/src/middleware/fastify-method-spoof.middleware.ts
  - packages/core/src/interceptor/render.interceptor.ts
  - packages/core/src/interceptor/redirect.interceptor.ts
  - packages/core/src/interceptor/scope-switcher.interceptor.ts
  - packages/core/src/interceptor/error-bag.interceptor.ts
  - packages/core/src/ssr/ssr-loader.service.ts
  - packages/core/src/asset/version.provider.ts
  - packages/core/src/flash/flash-store.ts
  - packages/core/src/errors/exceptions.ts
  - packages/codegen/src/generate.ts
  - packages/codegen/src/watch/watcher.ts
  - packages/codegen/src/watch/lock-file.ts
  - packages/codegen/src/discovery/pages.ts
  - packages/codegen/src/discovery/contracts-fast.ts
  - packages/codegen/src/emit/emit-routes.ts
  - packages/codegen/src/emit/emit-api.ts
  - packages/codegen/src/emit/emit-pages.ts
  - packages/codegen/src/emit/emit-index.ts
  - packages/codegen/src/emit/emit-cache.ts
  - packages/codegen/src/config/load-config.ts
  - packages/codegen/src/cli/codegen.ts
  - packages/codegen/src/cli/init.ts
  - packages/client/src/fetcher/fetcher.ts
  - packages/client/src/fetcher/url-builder.ts
  - packages/client/src/fetcher/errors.ts
  - packages/client/src/invalidate.ts
  - packages/client/src/contract/contract.ts
  - packages/client/src/contract/apply-contract.decorator.ts
  - packages/client/src/contract/contract-validation.pipe.ts
  - packages/client/src/ssr/hydrate.ts
  - packages/client/src/vue/link.ts
  - packages/vite/src/plugin/plugin.ts
  - packages/vite/src/setup.ts
  - packages/testing/src/testing-module.ts
  - packages/testing/src/assert.ts
  - packages/testing/src/expect.ts
findings:
  critical: 5
  warning: 9
  info: 4
  total: 18
status: issues_found
---

# Code Review Report

**Reviewed:** 2026-05-24
**Depth:** deep
**Files Reviewed:** 45+ source files across 5 packages
**Status:** issues_found

## Summary

This review covers the `@dudousxd/nestjs-inertia` monorepo across all 5 packages (core, codegen, client, vite, testing). The codebase is well-structured overall, with good separation of concerns and proper defense-in-depth in several areas (CSRF timing-safe comparison, page data serialization escaping, prototype pollution protection in dot-notation paths).

However, several security vulnerabilities, logic bugs, and quality issues were identified that should be addressed before shipping.

## Critical Issues

### CR-01: Lock file race condition allows concurrent watcher processes

**File:** `packages/codegen/src/watch/lock-file.ts:33-46`
**Issue:** The `acquireLock` function has a TOCTOU (time-of-check-time-of-use) race condition. Between reading the existing lock file and writing the new one, another process can also read the (stale) lock, see it as absent/dead, and proceed to write its own lock. Two processes end up believing they hold the lock, leading to concurrent file writes and data corruption in the generated output.

The function should use atomic file creation with `O_EXCL` (exclusive flag) or an advisory file lock mechanism (`flock`) rather than a read-then-write pattern.

**Fix:**
```typescript
import { open } from 'node:fs/promises';

export async function acquireLock(outDir: string): Promise<{ release: () => Promise<void> } | null> {
  await mkdir(outDir, { recursive: true });
  const lockPath = join(outDir, LOCK_FILE);

  // Try atomic creation first
  const lockData: LockData = { pid: process.pid, startedAt: new Date().toISOString() };
  try {
    const fd = await open(lockPath, 'wx'); // O_WRONLY | O_CREAT | O_EXCL
    await fd.writeFile(`${JSON.stringify(lockData, null, 2)}\n`, 'utf8');
    await fd.close();
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      // File exists — check if holder is alive
      try {
        const raw = await readFile(lockPath, 'utf8');
        const existing = JSON.parse(raw) as LockData;
        if (isProcessAlive(existing.pid)) return null;
        // Stale — remove and retry (still racy, but less so)
        await unlink(lockPath);
        return acquireLock(outDir);
      } catch { return null; }
    }
    return null;
  }

  return { release: async () => { try { await unlink(lockPath); } catch {} } };
}
```

---

### CR-02: `nullifyUndefined` only converts top-level `undefined` values

**File:** `packages/core/src/helpers/nullify-undefined.ts:3-9`
**Issue:** The `nullifyUndefined` function only nullifies `undefined` at the first nesting level. Nested objects containing `undefined` values are passed through unchanged. Since `JSON.stringify` silently drops keys with `undefined` values, any nested `undefined` will be lost from the wire representation. The function's purpose (ensuring wire-safe props) is only partially fulfilled.

For example: `{ user: { name: undefined } }` will serialize as `{ user: {} }` -- the `name` key disappears entirely from the client-side page object without any indication.

**Fix:**
```typescript
export function nullifyUndefined(props: Props): Props {
  const out: Props = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) {
      out[k] = null;
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      out[k] = nullifyUndefined(v as Props);
    } else if (Array.isArray(v)) {
      out[k] = v.map(item =>
        item === undefined ? null :
        typeof item === 'object' && item !== null ? nullifyUndefined(item as Props) : item
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}
```

---

### CR-03: Module-level mutable state in `contracts-fast.ts` causes cross-call corruption

**File:** `packages/codegen/src/discovery/contracts-fast.ts:30-31`
**Issue:** `_projectRoot` and `_tsconfigPaths` are module-level mutable variables set inside `discoverContractsFast()`. If two calls to `discoverContractsFast` with different options run concurrently (e.g., in tests, or if the watcher triggers overlapping invocations), they will silently corrupt each other's state. The `resolveModuleSpecifier` function reads `_projectRoot` and `_tsconfigPaths` from this shared mutable state rather than receiving them as parameters.

**Fix:** Pass `projectRoot` and `tsconfigPaths` through a context object instead of module-level state:
```typescript
interface DiscoveryContext {
  projectRoot: string;
  tsconfigPaths: Record<string, string[]> | null;
}

function resolveModuleSpecifier(
  moduleSpecifier: string,
  sourceFile: SourceFile,
  project: Project,
  ctx: DiscoveryContext, // pass context explicitly
): string[] {
  // Use ctx.projectRoot and ctx.tsconfigPaths instead of module-level vars
}
```

---

### CR-04: XSS via template engine locals injection in `file-shell.renderer.ts`

**File:** `packages/core/src/shell/file-shell.renderer.ts:77-79`
**Issue:** The `vite` and `asset` local functions pass user-provided strings (`entry`, `p`) directly into a template string that is then processed by `processDirectives`. If a template engine outputs these values unescaped back into the HTML, an attacker who controls the entry/asset path (e.g., via a manipulated Vite manifest or a config injection) could inject arbitrary content.

Specifically, `vite: (entry: string) => processDirectives(\`@vite('${entry}')\`, directiveCtx)` does not sanitize `entry`. If `entry` contains `')` followed by arbitrary HTML, the regex in `processDirectives` will not match, but the literal content of `entry` could still end up in the output unescaped by certain template engines.

More critically: if a template uses `{{{ inertia }}}` (unescaped) in Handlebars, the `inertiaHtml` local at line 69-71 contains `pageJson` which is sanitized, but the Handlebars adapter may allow custom interpolation of other locals that bypass escaping.

**Fix:** Sanitize the `entry` and `p` arguments before interpolation:
```typescript
const locals: Record<string, unknown> = {
  // ...
  vite: (entry: string) => {
    if (!/^[\w\-./]+$/.test(entry)) throw new Error(`Invalid vite entry: ${entry}`);
    return processDirectives(`@vite('${entry}')`, directiveCtx);
  },
  asset: (p: string) => {
    if (!/^[\w\-./]+$/.test(p)) throw new Error(`Invalid asset path: ${p}`);
    return processDirectives(`@asset('${p}')`, directiveCtx);
  },
};
```

---

### CR-05: `validateLocationUrl` incorrectly accepts URLs that fail `new URL()` as relative

**File:** `packages/core/src/service.ts:23-30`
**Issue:** When `new URL(url)` throws a `TypeError` (indicating it's not a valid absolute URL), the function returns the original `url` unchanged, treating it as a relative path. However, certain URLs that throw `TypeError` are not safe relative paths. For example:
- `javascript:alert(1)` is NOT a valid URL according to `new URL()` in Node.js (it requires a base), so it falls into the `TypeError` catch and gets returned raw.
- `//evil.com/path` (protocol-relative URL) will throw `TypeError` from `new URL()` without a base and be returned as-is, but when used in an HTTP `Location` header, the browser interprets it as `http://evil.com/path`.

The second case (`//evil.com/path`) is an open redirect vulnerability.

**Fix:**
```typescript
function validateLocationUrl(url: string): string {
  // Relative URLs starting with a single / are safe
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  // Reject protocol-relative URLs
  if (url.startsWith('//')) {
    throw new Error(`[nestjs-inertia] location() rejected protocol-relative URL: ${url}`);
  }
  // Attempt to parse as absolute URL
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`[nestjs-inertia] location() rejected unsafe URL scheme: ${url}`);
    }
    throw new Error(
      `[nestjs-inertia] location() rejected absolute URL to external host: ${url}.`
    );
  } catch (err) {
    if (err instanceof TypeError) {
      // Not a valid absolute URL — but might not be safe as a relative path either
      // Only allow paths that look like relative URLs (start with alphanum or /)
      if (/^[a-zA-Z0-9]/.test(url) || url.startsWith('.')) {
        return url;
      }
      throw new Error(`[nestjs-inertia] location() rejected unrecognized URL format: ${url}`);
    }
    throw err;
  }
}
```

## Warnings

### WR-01: `timingSafeEqualSafe` leaks length information via early return

**File:** `packages/core/src/csrf/csrf-token.ts:28-31`
**Issue:** The `timingSafeEqualSafe` function returns `false` immediately when buffer lengths differ. While this is documented as intentional, in the CSRF guard (`csrf.guard.ts:42`) this creates a potential timing oracle: an attacker can determine the length of the cookie token by observing response time differences when sending headers of varying lengths. The cookie token is `base64url(32 bytes) + "." + base64url(hmac)`, so its length is predictable -- mitigating this specific oracle. However, if the token format ever changes, this becomes exploitable.

**Fix:** Pad the shorter buffer before comparison to make the function truly constant-time regardless of length:
```typescript
export function timingSafeEqualSafe(a: Buffer, b: Buffer): boolean {
  const maxLen = Math.max(a.byteLength, b.byteLength);
  const aPadded = Buffer.alloc(maxLen);
  const bPadded = Buffer.alloc(maxLen);
  a.copy(aPadded);
  b.copy(bPadded);
  return timingSafeEqual(aPadded, bPadded) && a.byteLength === b.byteLength;
}
```

---

### WR-02: File-based shell renderer caches template forever in production

**File:** `packages/core/src/shell/file-shell.renderer.ts:40-41`
**Issue:** The `cachedTemplate` is set on first read and never invalidated. In development (where `NODE_ENV !== 'production'`), the template file is still only read once. If a developer modifies the shell HTML during development without restarting the NestJS server, changes will not be reflected. This creates confusion during development, especially since Vite HMR handles other file types automatically.

**Fix:** Skip caching in development mode:
```typescript
async render(ctx: ShellRenderCtx): Promise<string> {
  const isDev = process.env.NODE_ENV !== 'production';
  if (this.cachedTemplate === null || isDev) {
    this.cachedTemplate = readFileSync(this.absPath, 'utf8');
    if (isDev) this.engineRenderer = null; // re-compile on next render
  }
  // ...
}
```

---

### WR-03: `extractPropsSource` uses naive brace counting that fails on string literals

**File:** `packages/codegen/src/discovery/pages.ts:46-63`
**Issue:** The `extractPropsSource` function uses simple brace counting (`{` / `}`) to extract the TypeScript type body. This will produce incorrect results when the type body contains template literal types or string literals with braces. For example:
```typescript
export type ComponentProps = {
  template: `Hello {name}`;
}
```
The `{` inside the template literal will be counted, causing the extraction to continue past the actual closing brace, capturing extraneous code. Similarly, comments containing braces will confuse the parser.

**Fix:** At minimum, skip characters inside string literals, template literals, and comments during brace counting. A more robust approach would use ts-morph AST parsing for props extraction.

---

### WR-04: `ssrHead` injection in directives is unescaped

**File:** `packages/core/src/shell/directives.ts:23`
**Issue:** The `@inertiaHead` directive replaces itself with `ctx.ssrHead` directly without any sanitization. The `ssrHead` value comes from `ctx.ssr?.head.join('\n')` which is the raw output of the SSR bundle's `render()` function. If a compromised or buggy SSR bundle returns malicious content in the `head` array (e.g., `<script>alert('xss')</script>`), it will be injected directly into the HTML response.

While the SSR bundle is typically trusted server-side code, this creates a defense-in-depth gap -- any vulnerability in the SSR bundle becomes a direct XSS vector with no sanitization layer.

**Fix:** Document this trust boundary explicitly. For defense-in-depth, consider validating that SSR head entries only contain expected HTML elements (meta, title, link, style, script with specific attributes).

---

### WR-05: `FileBasedShellRenderer` uses synchronous `readFileSync` in an async method

**File:** `packages/core/src/shell/file-shell.renderer.ts:41`
**Issue:** `readFileSync` blocks the Node.js event loop. While the result is cached after the first call, the first request to any route using this renderer will block the event loop while reading the file. In high-concurrency scenarios, this blocks all other requests during that I/O operation.

**Fix:** Use `readFile` from `node:fs/promises` instead:
```typescript
import { readFile } from 'node:fs/promises';

async render(ctx: ShellRenderCtx): Promise<string> {
  if (this.cachedTemplate === null) {
    this.cachedTemplate = await readFile(this.absPath, 'utf8');
  }
  // ...
}
```

---

### WR-06: Watcher debounce timer callbacks swallow all errors silently

**File:** `packages/codegen/src/watch/watcher.ts:88-94, 115-134`
**Issue:** Both the pages watcher and contracts watcher catch and discard all errors (`catch { }`) during regeneration. This means if the codegen consistently fails (e.g., due to a broken config, permissions issue, or disk full), the developer gets zero feedback. The `onChange` callback is still invoked even when generation failed, potentially leading downstream consumers to believe fresh output was produced.

**Fix:** Log errors to stderr rather than silently swallowing:
```typescript
try {
  await generate(config);
} catch (err) {
  console.error('[nestjs-inertia-codegen] Generation failed:', err instanceof Error ? err.message : err);
}
```

---

### WR-07: `ContractValidationPipe` validates `params` type but does not apply schema validation

**File:** `packages/client/src/contract/contract-validation.pipe.ts:32-38`
**Issue:** The pipe checks `metadata.type === 'body'` and `metadata.type === 'query'` but does not handle `metadata.type === 'param'`. If a contract defines a `params` schema (via `ContractDef`), the params will never be validated at runtime even when `validate: true` is set. This is inconsistent with the contract definition which allows a `params` schema.

**Fix:**
```typescript
transform(value: unknown, metadata: ArgumentMetadata): unknown {
  let schema: /* ... */ | undefined;

  if (metadata.type === 'body' && this.contract.body) {
    schema = this.contract.body as typeof schema;
  } else if (metadata.type === 'query' && this.contract.query) {
    schema = this.contract.query as typeof schema;
  } else if (metadata.type === 'param' && this.contract.params) {
    schema = this.contract.params as typeof schema;
  } else {
    return value;
  }
  // ...
}
```

---

### WR-08: `buildUrl` does not validate that `path` starts with `/`

**File:** `packages/client/src/fetcher/url-builder.ts:17`
**Issue:** When `baseUrl` is provided, `buildUrl` concatenates `base + resolved`. If `path` does not start with `/`, this produces a malformed URL. For example: `buildUrl('users/1', {}, 'https://api.test')` produces `https://api.testusers/1` instead of `https://api.test/users/1`.

**Fix:**
```typescript
export function buildUrl(path: string, opts: BuildUrlOptions = {}, baseUrl?: string): string {
  // Ensure path starts with /
  let normalizedPath = path.startsWith('/') ? path : `/${path}`;
  // ... rest of function uses normalizedPath
}
```

---

### WR-09: `execSync` in `init.ts` is vulnerable to command injection via dependency names

**File:** `packages/codegen/src/cli/init.ts:207`
**Issue:** While the dependency names are hardcoded in the current implementation, the `installDeps` function accepts arbitrary string arrays and passes them directly to `execSync` via string interpolation. If this function is ever called with user-derived dependency names (e.g., from package.json parsing or user input), it would be vulnerable to command injection.

The function should use `execFileSync` with an argument array to prevent shell interpretation.

**Fix:**
```typescript
import { execFileSync } from 'node:child_process';

export function installDeps(pkgManager: PackageManager, deps: string[], dev: boolean): void {
  if (deps.length === 0) return;
  const args: string[] = [];
  if (pkgManager === 'npm') {
    args.push('install');
    if (dev) args.push('--save-dev');
  } else {
    args.push('add');
    if (dev) args.push('-D');
  }
  args.push(...deps);
  try {
    execFileSync(pkgManager, args, { stdio: 'inherit' });
  } catch {
    logWarning(`Failed to install: ${deps.join(', ')}`);
  }
}
```

## Info

### IN-01: Dead code: `detectCollisions` function is never called

**File:** `packages/codegen/src/emit/emit-api.ts:91-102`
**Issue:** The `detectCollisions` function body is effectively a no-op (it iterates the tree but performs no checks and voids both `key` and `name`). On line 383, it's referenced via `void detectCollisions` solely to suppress an unused-variable warning. This is dead code that adds confusion without providing value.

**Fix:** Remove the `detectCollisions` function and the `void detectCollisions` reference entirely.

---

### IN-02: `_resolveCodegenModule` uses `new Function` to bypass bundler analysis

**File:** `packages/core/src/module.ts:374`
**Issue:** Using `new Function('s', 'return import(s)')` is flagged by many security linters as equivalent to `eval`. While the intent (avoiding static bundler analysis of an optional peer dependency) is valid, it could trigger CSP violations in environments with strict Content-Security-Policy headers. A cleaner approach would be a try/catch around a standard dynamic import with a bundler-specific ignore comment.

**Fix:** Use the standard dynamic import with a suppression comment:
```typescript
protected async _resolveCodegenModule(): Promise<CodegenModule> {
  const specifier = '@dudousxd/nestjs-inertia-codegen';
  return import(/* webpackIgnore: true */ specifier) as Promise<CodegenModule>;
}
```

---

### IN-03: Unused import of `createInertiaDecorator` in markers public API

**File:** `packages/core/src/markers.ts:1`
**Issue:** The `createInertiaDecorator` import is used at line 24 but the coupling is somewhat confusing -- `markers.ts` imports from `decorator/inertia.decorator.ts` to create the `Inertia` namespace function. This circular conceptual dependency (markers used by service, but markers.ts imports from decorators) makes the module graph harder to reason about. Consider extracting the `Inertia` namespace assembly to a separate file.

**Fix:** Not blocking -- restructure if maintaining becomes difficult.

---

### IN-04: `emitIndex` writes `index.d.ts` with `.js` extensions in exports

**File:** `packages/codegen/src/emit/emit-index.ts:6`
**Issue:** The emitted `index.d.ts` re-exports from `'./pages.js'` and `'./routes.js'` but these are `.d.ts` files being generated. While TypeScript with `moduleResolution: "bundler"` or `"node16"` resolves `.js` to `.d.ts`, this could confuse IDEs or older TypeScript configurations that don't support this resolution strategy. The emitted `routes.ts` is a runtime file, but `pages.d.ts` is a pure type declaration.

**Fix:** Consider emitting consistent file references or documenting the required `moduleResolution` setting.

---

_Reviewed: 2026-05-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_

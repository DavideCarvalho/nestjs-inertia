import { Logger } from '@nestjs/common';
import type { InertiaRequest, InertiaResponse } from './adapter/adapter.js';
import type { InertiaPages } from './types/registry.js';

/**
 * Validates a redirect URL to prevent open-redirect attacks.
 * Only relative URLs (starting with `/`) or same-origin absolute URLs are
 * permitted. Absolute URLs to other hosts throw an error.
 */
function validateLocationUrl(url: string): string {
  // Relative URLs starting with a single / are safe
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  // Reject protocol-relative URLs (//evil.com/path)
  if (url.startsWith('//')) {
    throw new Error(`[nestjs-inertia] location() rejected protocol-relative URL: ${url}`);
  }
  // Attempt to parse as absolute URL
  try {
    const parsed = new URL(url);
    // Allow only http/https schemes (no javascript: etc.)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`[nestjs-inertia] location() rejected unsafe URL scheme: ${url}`);
    }
    // Same-origin check: if called on the server, we don't have the request origin,
    // so we reject all absolute URLs to external hosts.
    throw new Error(
      `[nestjs-inertia] location() rejected absolute URL to external host: ${url}. Use a relative path (e.g. "/dashboard") instead.`,
    );
  } catch (err) {
    if (err instanceof TypeError) {
      // Not a valid absolute URL — only allow paths that look like relative URLs
      if (/^[a-zA-Z0-9]/.test(url) || url.startsWith('.')) {
        return url;
      }
      throw new Error(`[nestjs-inertia] location() rejected unrecognized URL format: ${url}`);
    }
    throw err;
  }
}
import type { Manifest } from './asset/version.provider.js';
import type { FlashStore } from './flash/flash-store.js';
import { nullifyUndefined } from './helpers/nullify-undefined.js';
import { unpackDotKeys } from './helpers/set-nested.js';
import { type Marker, getMarkerKind, getMarkerMeta, getMarkerValue, isMarker } from './markers.js';
import type { PageObject, Props, SharedInput, ShellRenderCtx } from './types.js';

/** Sentinel to indicate a prop should be omitted from the output. */
const OMIT = Symbol('inertia.omit');

/** Returns true if the value contains any `always()` markers at any nesting depth. */
function containsAlwaysMarker(value: unknown): boolean {
  if (isMarker(value)) {
    return getMarkerKind(value as Marker) === 'always';
  }
  if (Array.isArray(value)) {
    return value.some(containsAlwaysMarker);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value as Record<string, unknown>).some(containsAlwaysMarker);
  }
  return false;
}

/**
 * Recursively resolve a nested plain object, walking all keys and resolving markers.
 *
 * @param obj         The object whose keys should be walked
 * @param topKey      The top-level prop key (used to build full dot-paths for deferredProps)
 * @param subKeep     Relative sub-path keep list (null = include all non-optional markers)
 *                    e.g. if top-level keep=["user.avatar"], subKeep=["avatar"] for the "user" object
 * @param deferredProps Mutable deferred props map
 */
async function resolveNestedObjectValue(
  obj: Record<string, unknown>,
  topKey: string,
  subKeep: string[] | null,
  deferredProps: Record<string, string[]>,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    // Build relative dotPath for this child (relative to topKey)
    // Full path = topKey + "." + k  but we store sub-paths relative to topKey
    const resolved = await resolveNestedValueInner(v, k, topKey, subKeep, deferredProps);
    if (resolved !== OMIT) out[k] = resolved;
  }
  return out;
}

/**
 * Inner recursive resolver. Works on arbitrary values (markers, objects, arrays, scalars).
 *
 * @param value       Value to resolve
 * @param relPath     Path relative to topKey (e.g. "profile.avatar" for user.profile.avatar)
 * @param topKey      Top-level prop key
 * @param subKeep     Sub-path keep list relative to topKey (null = no filter)
 * @param deferredProps Mutable deferred props map
 */
async function resolveNestedValueInner(
  value: unknown,
  relPath: string,
  topKey: string,
  subKeep: string[] | null,
  deferredProps: Record<string, string[]>,
): Promise<unknown | typeof OMIT> {
  if (isMarker(value)) {
    return resolveMarker(value as Marker, relPath, topKey, subKeep, deferredProps);
  }

  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      const resolved = await resolveNestedValueInner(item, relPath, topKey, subKeep, deferredProps);
      if (resolved !== OMIT) out.push(resolved);
    }
    return out;
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const childPath = `${relPath}.${k}`;
      const resolved = await resolveNestedValueInner(v, childPath, topKey, subKeep, deferredProps);
      if (resolved !== OMIT) out[k] = resolved;
    }
    return out;
  }

  // Scalar value: apply sub-path filter if active
  if (subKeep !== null) {
    // Include scalars only if their relPath is explicitly listed OR is a prefix of a listed path
    const included = subKeep.some((k) => k === relPath || k.startsWith(`${relPath}.`));
    if (!included) return OMIT;
  }

  return value;
}

async function resolveMarker(
  marker: Marker,
  relPath: string,
  topKey: string,
  subKeep: string[] | null,
  deferredProps: Record<string, string[]>,
): Promise<unknown | typeof OMIT> {
  const kind = getMarkerKind(marker);
  // Full dot-path (as it would appear in X-Inertia-Partial-Data)
  const fullPath = `${topKey}.${relPath}`;

  if (kind === 'always') {
    return getMarkerValue(marker)();
  }

  if (kind === 'optional') {
    // subKeep === null: full reload — omit optional
    // subKeep !== null: partial reload — include only if relPath is listed
    if (subKeep?.includes(relPath)) {
      return getMarkerValue(marker)();
    }
    return OMIT;
  }

  if (kind === 'once') {
    // once() at nested level: resolve on full reload (subKeep === null), omit on partial
    if (subKeep === null) {
      return getMarkerValue(marker)();
    }
    return OMIT;
  }

  if (kind === 'defer') {
    if (subKeep !== null) {
      // Partial reload: resolve only if listed
      if (subKeep.includes(relPath)) return getMarkerValue(marker)();
      return OMIT;
    }
    // Full reload: register as deferred using full dot-path
    const meta = getMarkerMeta(marker) as { group: string };
    const group = meta.group;
    const existing = deferredProps[group];
    if (existing) existing.push(fullPath);
    else deferredProps[group] = [fullPath];
    return OMIT;
  }

  if (kind === 'merge') {
    // merge() at nested level: resolve (merge metadata only applies at top-level)
    if (subKeep !== null && !subKeep.includes(relPath)) return OMIT;
    return getMarkerValue(marker)();
  }

  return OMIT;
}

export interface SsrModule {
  render(page: PageObject): Promise<{ head: string[]; body: string }>;
}

export interface SsrLoader {
  load(): Promise<SsrModule | null>;
}

export interface InertiaServiceDeps {
  assetVersion: string;
  manifest: Manifest | null;
  ssrLoader: SsrLoader;
  rootViewRender: (ctx: ShellRenderCtx) => Promise<string>;
  moduleShare: SharedInput | undefined;
  featureShare: SharedInput | undefined;
  historyEncryptionDefault?: boolean;
  flashStore: FlashStore | undefined;
}

/**
 * Typed render overloads. When `InertiaPages` has been augmented by codegen,
 * calling `render('PageName', props)` constrains `props` to that page's
 * `ComponentProps` type. Without codegen, falls back to `Record<string, unknown>`.
 *
 * Uses interface-class declaration merging so the implementation signature
 * stays simple while callers get type safety.
 */
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: intentional — typed render overloads via interface-class merging
export interface InertiaService {
  render<K extends keyof InertiaPages>(
    component: K,
    props: InertiaPages[K] extends Record<string, unknown> ? InertiaPages[K] : Props,
  ): Promise<void>;
  render(component: string, props?: Props): Promise<void>;
}

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: see above
export class InertiaService {
  private readonly logger = new Logger(InertiaService.name);
  private shared: SharedInput[] = [];
  private encryptHistoryFlag: boolean | undefined;
  private clearHistoryFlag = false;

  constructor(
    private readonly req: InertiaRequest,
    private readonly res: InertiaResponse,
    private readonly deps: InertiaServiceDeps,
  ) {}

  share(input: SharedInput): this {
    this.shared.push(input);
    return this;
  }

  /**
   * Perform an Inertia redirect. For Inertia XHR requests, issues a 409 with
   * `X-Inertia-Location`; for plain browser visits, issues a 302 redirect.
   *
   * Only relative URLs (starting with `/`) or same-origin absolute URLs are
   * accepted. Absolute URLs pointing to a different host are rejected to prevent
   * open-redirect vulnerabilities.
   *
   * @param url Relative path (e.g. `/dashboard`) or same-origin absolute URL.
   * @throws Error when `url` is an absolute URL pointing to a different origin.
   */
  location(url: string): void {
    const safeUrl = validateLocationUrl(url);
    if (this.req.header('X-Inertia')) {
      this.res.status(409).setHeader('X-Inertia-Location', safeUrl).end();
    } else {
      this.res.status(302).setHeader('Location', safeUrl).end();
    }
  }

  encryptHistory(value = true): this {
    this.encryptHistoryFlag = value;
    return this;
  }

  clearHistory(): this {
    this.clearHistoryFlag = true;
    return this;
  }

  private async resolveShared(): Promise<Props> {
    const sources: SharedInput[] = [];
    if (this.deps.moduleShare !== undefined) sources.push(this.deps.moduleShare);
    if (this.deps.featureShare !== undefined) sources.push(this.deps.featureShare);
    sources.push(...this.shared);

    const out: Props = {};
    for (const s of sources) {
      const resolved = typeof s === 'function' ? await s(this.req) : s;
      Object.assign(out, resolved);
    }
    return out;
  }

  async render(component: string, props: Props = {}): Promise<void> {
    // Version mismatch check (short-circuit before any factory resolution)
    const clientVersion = this.req.header('X-Inertia-Version');
    if (
      this.req.method === 'GET' &&
      this.req.header('X-Inertia') &&
      clientVersion !== undefined &&
      clientVersion !== this.deps.assetVersion
    ) {
      this.res.status(409).setHeader('X-Inertia-Location', this.req.originalUrl).end();
      return;
    }

    // Auto-resolve errors from FlashStore if configured and not provided in props
    if (this.deps.flashStore && props.errors === undefined) {
      try {
        const flashed = await this.deps.flashStore.read(this.req.raw);
        if (flashed && Object.keys(flashed).length > 0) {
          this.share({ errors: flashed });
        }
      } catch (err) {
        // Log the failure so developers can debug flash store issues,
        // but don't crash the request — errors stay {}
        this.logger.warn(
          `FlashStore.read() threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const sharedProps = await this.resolveShared();
    const rawProps: Props = { ...sharedProps, ...props };
    if (rawProps.errors === undefined) rawProps.errors = {};

    const partialComponent = this.req.header('X-Inertia-Partial-Component');
    const isPartial = partialComponent === component;
    const partialDataHeader = this.req.header('X-Inertia-Partial-Data');
    const keepList =
      isPartial && partialDataHeader ? partialDataHeader.split(',').filter(Boolean) : null;
    const keep = keepList && keepList.length > 0 ? keepList : null;

    const resetHeader = this.req.header('X-Inertia-Reset');
    const resetKeys = (resetHeader ?? '').split(',').filter(Boolean);

    const resetOnceHeader = this.req.header('X-Inertia-Reset-Once');
    const resetOnceKeys = (resetOnceHeader ?? '').split(',').filter(Boolean);

    const exceptHeader = this.req.header('X-Inertia-Partial-Except');
    const exceptKeys = isPartial ? (exceptHeader ?? '').split(',').filter(Boolean) : [];

    const finalProps: Props = {};
    const deferredProps: Record<string, string[]> = {};
    const mergeProps: string[] = [];
    const deepMergeProps: string[] = [];
    const matchPropsOn: Record<string, string> = {};

    for (const [key, value] of Object.entries(rawProps)) {
      if (exceptKeys.includes(key) && key !== 'errors') continue;
      if (isMarker(value)) {
        const kind = getMarkerKind(value);
        if (kind === 'always') {
          finalProps[key] = await getMarkerValue(value)();
          continue;
        }
        if (kind === 'optional') {
          if (keep?.includes(key)) {
            finalProps[key] = await getMarkerValue(value)();
          }
          continue;
        }
        if (kind === 'once') {
          // Initial visit (no partial) OR explicit reset-once for this key
          if (!keep || resetOnceKeys.includes(key)) {
            finalProps[key] = await getMarkerValue(value)();
          }
          continue;
        }
        if (kind === 'defer') {
          if (keep) {
            if (keep.includes(key)) finalProps[key] = await getMarkerValue(value)();
            continue;
          }
          const meta = getMarkerMeta(value) as { group: string };
          const group = meta.group;
          const existing = deferredProps[group];
          if (existing) existing.push(key);
          else deferredProps[group] = [key];
          continue;
        }
        if (kind === 'merge') {
          const meta = getMarkerMeta(value) as { matchOn?: string; deep?: boolean };
          if (keep && !keep.includes(key) && key !== 'errors') continue;
          const resolved = await getMarkerValue(value)();
          finalProps[key] = resolved;
          // Suppress merge metadata if key is in X-Inertia-Reset
          if (!resetKeys.includes(key)) {
            if (meta.deep) deepMergeProps.push(key);
            else mergeProps.push(key);
          }
          if (meta.matchOn !== undefined) matchPropsOn[key] = meta.matchOn;
          continue;
        }
      }

      // Non-marker branch: filter by top-level key OR dot-path prefix, then resolve
      // A key passes if:
      //   (a) no partial filter (keep is null), OR
      //   (b) errors key (always included), OR
      //   (c) exact match in keep list, OR
      //   (d) a keep entry is a dot-path starting with this key (e.g. keep=["user.avatar"] passes key="user")
      //   (e) value contains a nested always() marker (always() must resolve regardless of partial filter)
      const hasNestedKeepPath = keep?.some((k) => k.startsWith(`${key}.`)) ?? false;
      const hasNestedAlways = keep ? containsAlwaysMarker(value) : false;
      if (keep && !keep.includes(key) && key !== 'errors' && !hasNestedKeepPath && !hasNestedAlways)
        continue;

      let resolved: unknown = value;
      if (typeof value === 'function') {
        resolved = await (value as () => unknown | Promise<unknown>)();
      }

      // v3: recursively resolve nested markers inside plain objects/arrays.
      // Build a "sub-keep" list: for paths like "user.avatar", when processing key="user",
      // pass "avatar" as the sub-path so the nested resolver knows what to include.
      // null means "include everything (no filter)", [] would mean include nothing.
      let nestedKeep: string[] | null = null;
      if (keep !== null) {
        if (keep.includes(key)) {
          // Exact match: include all children (null = unfiltered)
          nestedKeep = null;
        } else {
          // Only dot-path sub-entries are in keep; filter children accordingly
          nestedKeep = keep
            .filter((k) => k.startsWith(`${key}.`))
            .map((k) => k.slice(key.length + 1));
        }
      }

      if (typeof resolved === 'object' && resolved !== null && !Array.isArray(resolved)) {
        // Walk nested object for markers
        resolved = await resolveNestedObjectValue(
          resolved as Record<string, unknown>,
          key,
          nestedKeep,
          deferredProps,
        );
      }

      finalProps[key] = resolved;
    }

    // Dot-notation unpacking (top-level keys with '.')
    const unpackedProps = unpackDotKeys(finalProps);

    // undefined → null wire conversion
    const wireProps = nullifyUndefined(unpackedProps);

    const page: PageObject = {
      component,
      props: wireProps,
      url: this.req.originalUrl,
      version: this.deps.assetVersion,
    };
    if (Object.keys(deferredProps).length > 0) page.deferredProps = deferredProps;
    if (mergeProps.length > 0) page.mergeProps = mergeProps;
    if (deepMergeProps.length > 0) page.deepMergeProps = deepMergeProps;
    if (Object.keys(matchPropsOn).length > 0) page.matchPropsOn = matchPropsOn;
    // v3: only emit encryptHistory / clearHistory when truthy
    const encryptHistory =
      this.encryptHistoryFlag !== undefined
        ? this.encryptHistoryFlag
        : (this.deps.historyEncryptionDefault ?? false);
    if (encryptHistory) page.encryptHistory = true;
    if (this.clearHistoryFlag) page.clearHistory = true;

    if (this.req.header('X-Inertia')) {
      this.res.setHeader('X-Inertia', 'true').setHeader('Vary', 'X-Inertia').json(page);
      return;
    }

    const ssrModule = await this.deps.ssrLoader.load();
    const ssr = ssrModule ? await ssrModule.render(page) : null;
    const html = await this.deps.rootViewRender({
      page,
      ssr,
      manifest: this.deps.manifest,
      assetVersion: this.deps.assetVersion,
      ctx: { req: this.req.raw, res: this.res.raw },
    });
    this.res.setHeader('Vary', 'X-Inertia').html(html);
  }
}

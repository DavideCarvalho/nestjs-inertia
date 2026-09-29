import type { Manifest } from '../asset/version.provider.js';

export interface DirectiveContext {
  pageJson: string;
  ssrHead: string;
  ssrBody: string | null;
  manifest: Manifest | null;
  isDev: boolean;
  /**
   * Public URL prefix of the Vite build (Vite's `base`, the module's `vite.base`), prepended to
   * every emitted asset URL. Default `'/'`.
   */
  base?: string | undefined;
}

/**
 * Normalizes a Vite `base` to a prefix ending in `/`: `'m'`/`'/m'`/`'/m/'` → `'/m/'`, a full URL
 * (`https://cdn…/m`) keeps its origin, and an empty/absent base is `'/'`.
 */
export function normalizeAssetBase(base: string | undefined): string {
  if (!base || base === '/') return '/';
  const withTrailing = base.endsWith('/') ? base : `${base}/`;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(withTrailing) || withTrailing.startsWith('//')) {
    return withTrailing;
  }
  return withTrailing.startsWith('/') ? withTrailing : `/${withTrailing}`;
}

const viteRefreshPreamble = (base: string) => `<script type="module">
import RefreshRuntime from "${base}@react-refresh"
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true
</script>`;

export function processDirectives(template: string, ctx: DirectiveContext): string {
  let out = template;
  const base = normalizeAssetBase(ctx.base);

  // @inertiaHead FIRST (more specific — prevents @inertia from consuming the 'H')
  out = out.replace(/@inertiaHead\b/g, () => ctx.ssrHead);

  // @inertia (no args) — lookahead ensures we don't match inside @inertiaHead (already consumed)
  out = out.replace(/@inertia(?![a-zA-Z(])/g, () => {
    if (ctx.ssrBody) return ctx.ssrBody;
    return `<div id="app"></div>\n<script data-page="app" type="application/json">${ctx.pageJson}</script>`;
  });

  // @viteRefresh (no args)
  out = out.replace(/@viteRefresh\b/g, () => (ctx.isDev ? viteRefreshPreamble(base) : ''));

  // @vite('entry') — in dev: HMR client + React Refresh preamble + entry script
  out = out.replace(/@vite\(\s*['"]([^'"]+)['"]\s*\)/g, (_full, entry: string) => {
    if (ctx.isDev) {
      return [
        `<script type="module" src="${base}@vite/client"></script>`,
        viteRefreshPreamble(base),
        `<script type="module" src="${base}${entry}"></script>`,
      ].join('\n');
    }
    const entryRecord = ctx.manifest?.[entry];
    if (!entryRecord) {
      throw new Error(`[nestjs-inertia] manifest entry not found for "${entry}"`);
    }
    const scriptTag = `<script type="module" src="${base}${entryRecord.file}"></script>`;
    const cssTags = (entryRecord.css ?? [])
      .map((href) => `<link rel="stylesheet" href="${base}${href}" />`)
      .join('\n');
    return [scriptTag, cssTags].filter(Boolean).join('\n');
  });

  // @asset('path')
  out = out.replace(/@asset\(\s*['"]([^'"]+)['"]\s*\)/g, (_full, path: string) => {
    if (ctx.isDev) return `${base}${path}`;
    const entry = ctx.manifest?.[path];
    return entry ? `${base}${entry.file}` : `${base}${path}`;
  });

  return out;
}

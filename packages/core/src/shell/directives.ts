import type { Manifest } from '../asset/version.provider.js';

export interface DirectiveContext {
  pageJson: string;
  ssrHead: string;
  ssrBody: string | null;
  manifest: Manifest | null;
  isDev: boolean;
}

const VITE_REFRESH_PREAMBLE = `<script type="module">
import RefreshRuntime from "/@react-refresh"
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true
</script>`;

export function processDirectives(template: string, ctx: DirectiveContext): string {
  let out = template;

  // @inertiaHead FIRST (more specific — prevents @inertia from consuming the 'H')
  out = out.replace(/@inertiaHead\b/g, () => ctx.ssrHead);

  // @inertia (no args) — lookahead ensures we don't match inside @inertiaHead (already consumed)
  out = out.replace(/@inertia(?![a-zA-Z(])/g, () => {
    if (ctx.ssrBody) return ctx.ssrBody;
    return `<div id="app"></div>\n<script id="inertia-page" type="application/json">${ctx.pageJson}</script>`;
  });

  // @viteRefresh (no args)
  out = out.replace(/@viteRefresh\b/g, () => (ctx.isDev ? VITE_REFRESH_PREAMBLE : ''));

  // @vite('entry') — in dev: HMR client + React Refresh preamble + entry script
  out = out.replace(/@vite\(\s*['"]([^'"]+)['"]\s*\)/g, (_full, entry: string) => {
    if (ctx.isDev) {
      return [
        `<script type="module" src="/@vite/client"></script>`,
        VITE_REFRESH_PREAMBLE,
        `<script type="module" src="/${entry}"></script>`,
      ].join('\n');
    }
    const entryRecord = ctx.manifest?.[entry];
    if (!entryRecord) {
      throw new Error(`[nestjs-inertia] manifest entry not found for "${entry}"`);
    }
    const scriptTag = `<script type="module" src="/${entryRecord.file}"></script>`;
    const cssTags = (entryRecord.css ?? [])
      .map((href) => `<link rel="stylesheet" href="/${href}" />`)
      .join('\n');
    return [scriptTag, cssTags].filter(Boolean).join('\n');
  });

  // @asset('path')
  out = out.replace(/@asset\(\s*['"]([^'"]+)['"]\s*\)/g, (_full, path: string) => {
    if (ctx.isDev) return `/${path}`;
    const entry = ctx.manifest?.[path];
    return entry ? `/${entry.file}` : `/${path}`;
  });

  return out;
}

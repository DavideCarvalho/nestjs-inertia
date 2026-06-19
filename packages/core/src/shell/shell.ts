import type { ShellRenderCtx } from '../types.js';
import { markServerRendered } from './mark-server-rendered.js';
import { serializePageData } from './serialize-page.js';

/** The two halves of the shell document surrounding the streamed app body. */
export interface ShellParts {
  /** Everything up to (and including the opening of) the app mount point. */
  head: string;
  /** Everything after the app body — the data script and closing tags. */
  tail: string;
}

export interface ShellRenderer {
  render(ctx: ShellRenderCtx): Promise<string>;
  /**
   * Optional streaming seam. Renders the shell split into `{ head, tail }` around
   * where the SSR app body would go, so the head can be flushed before the app
   * body has rendered. Renderers that cannot split safely may omit this; the
   * service then falls back to buffered SSR.
   */
  renderToParts?(ctx: ShellRenderCtx): Promise<ShellParts>;
}

/**
 * Sentinel substituted in place of the SSR body when splitting the shell into
 * head/tail. Chosen to be unique and HTML-comment-wrapped so it never appears in
 * legitimately serialized content.
 */
export const SSR_BODY_SENTINEL = '<!--nestjs-inertia-ssr-body-CFB1A7-->';

export class DefaultShellRenderer implements ShellRenderer {
  async render(ctx: ShellRenderCtx): Promise<string> {
    const pageJson = serializePageData(ctx.page);
    const body = ctx.ssr?.body != null ? markServerRendered(ctx.ssr.body) : '<div id="app"></div>';
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Inertia</title>
  </head>
  <body>
    ${body}
    <script data-page="app" type="application/json">${pageJson}</script>
  </body>
</html>`;
  }

  async renderToParts(ctx: ShellRenderCtx): Promise<ShellParts> {
    const full = await this.render({
      ...ctx,
      ssr: { head: ctx.ssr?.head ?? [], body: SSR_BODY_SENTINEL },
    });
    return splitOnSentinel(full);
  }
}

/** Splits a fully rendered shell document on {@link SSR_BODY_SENTINEL}. */
export function splitOnSentinel(full: string): ShellParts {
  const idx = full.indexOf(SSR_BODY_SENTINEL);
  if (idx === -1) {
    // Sentinel missing (renderer ignored the body): treat whole doc as head so
    // streaming still emits valid HTML (app body appended, no tail).
    return { head: full, tail: '' };
  }
  return {
    head: full.slice(0, idx),
    tail: full.slice(idx + SSR_BODY_SENTINEL.length),
  };
}

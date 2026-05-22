import type { ShellRenderCtx } from '../types.js';
import { serializePageData } from './serialize-page.js';

export interface ShellRenderer {
  render(ctx: ShellRenderCtx): Promise<string>;
}

export class DefaultShellRenderer implements ShellRenderer {
  async render(ctx: ShellRenderCtx): Promise<string> {
    const pageJson = serializePageData(ctx.page);
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Inertia</title>
  </head>
  <body>
    <div id="app"></div>
    <script id="inertia-page" type="application/json">${pageJson}</script>
  </body>
</html>`;
  }
}

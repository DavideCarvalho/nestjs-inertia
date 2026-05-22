import { escapeHtml } from '../helpers/escape-html.js';
import type { ShellRenderCtx } from '../types.js';

export interface ShellRenderer {
  render(ctx: ShellRenderCtx): Promise<string>;
}

export class DefaultShellRenderer implements ShellRenderer {
  async render(ctx: ShellRenderCtx): Promise<string> {
    const pageJson = escapeHtml(JSON.stringify(ctx.page));
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Inertia</title>
  </head>
  <body>
    <div id="app" data-page="${pageJson}"></div>
  </body>
</html>`;
  }
}

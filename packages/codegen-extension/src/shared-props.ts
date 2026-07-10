import { existsSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import type { EmittedFile } from '@dudousxd/nestjs-codegen/extension';
import { Node } from 'ts-morph';
import type { EmitContext } from './emit-context.js';

/**
 * Explicit source for the `InertiaSharedProps` shape. Shared props are commonly registered
 * per-request in middleware (`req.inertia.share(...)`) rather than statically in
 * `InertiaModule.forRoot()`, so static inference is a dead end — the caller names the module
 * and export directly.
 */
export type SharedPropsSource = {
  /** Path to the module exporting the shared-props shape, relative to `cwd`. */
  module: string;
  /** Named export to read from that module. */
  export: string;
  /**
   * `'function'`: the export is a factory (e.g. the `share()` callback) whose
   * `Awaited<ReturnType<...>>` is the shape.
   * `'type'`: the export IS the shape — a `type` alias or `interface`.
   */
  kind: 'function' | 'type';
};

export const SHARED_FILE_PATH = 'shared.ts';

const TS_EXTENSION_CANDIDATES = ['.ts', '.tsx'];

/** Resolves `source.module` (relative to `cwd`) to an absolute file path that exists on disk. */
function resolveModuleFile(cwd: string, modulePath: string): string {
  const withoutExtension = modulePath.replace(/\.tsx?$/, '');
  const absoluteBase = resolve(cwd, withoutExtension);
  for (const extension of TS_EXTENSION_CANDIDATES) {
    const candidate = `${absoluteBase}${extension}`;
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `nestjs-inertia codegen: shared.module "${modulePath}" (resolved to "${absoluteBase}.ts") does not exist. Check the path is relative to \`cwd\` and points at the module exporting your shared-props shape.`,
  );
}

/**
 * Computes the module specifier for `filePath` relative to `outDir`, with the `.ts`
 * extension stripped and posix separators — e.g. `cwd=/app`, `outDir=/app/.nestjs-inertia`,
 * `module=./src/x` → `../src/x`.
 */
function toRelativeSpecifier(outDir: string, filePath: string): string {
  const withoutExtension = filePath.replace(/\.tsx?$/, '');
  const relativePath = relative(outDir, withoutExtension).split(sep).join('/');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

const FUNCTION_EXPORT_KINDS = new Set([
  'FunctionDeclaration',
  'ArrowFunction',
  'FunctionExpression',
]);
const TYPE_EXPORT_KINDS = new Set(['TypeAliasDeclaration', 'InterfaceDeclaration']);

/**
 * Validates that `exportName` exists in the file at `filePath` and looks like the declared
 * `kind`. Throws an actionable error rather than silently emitting a `shared.ts` whose
 * `import("...")` reference is broken — that failure would otherwise surface far away, as a
 * confusing type error in a consumer's frontend build.
 */
function assertExportShape(
  ctx: EmitContext,
  filePath: string,
  exportName: string,
  kind: 'function' | 'type',
): void {
  const project = ctx.project();
  const sourceFile =
    project.addSourceFileAtPathIfExists(filePath) ?? project.getSourceFile(filePath);
  if (!sourceFile) {
    throw new Error(
      `nestjs-inertia codegen: could not load "${filePath}" for shared-props validation.`,
    );
  }

  const exportedDeclarations = sourceFile.getExportedDeclarations();
  const declarations = exportedDeclarations.get(exportName);
  if (!declarations || declarations.length === 0) {
    const available = [...exportedDeclarations.keys()].sort().join(', ') || '(no exports found)';
    throw new Error(
      `nestjs-inertia codegen: shared.export "${exportName}" not found in "${filePath}". ` +
        `Available exports: ${available}.`,
    );
  }

  const expectedKinds = kind === 'type' ? TYPE_EXPORT_KINDS : FUNCTION_EXPORT_KINDS;
  const matchesKind = declarations.some((declaration) => {
    if (expectedKinds.has(declaration.getKindName())) return true;
    // `export const buildSharedProps = () => {...}` — the exported declaration is the
    // VariableDeclaration; its initializer is the actual function.
    if (kind === 'function' && Node.isVariableDeclaration(declaration)) {
      const initializer = declaration.getInitializer();
      return initializer !== undefined && FUNCTION_EXPORT_KINDS.has(initializer.getKindName());
    }
    return false;
  });
  if (!matchesKind) {
    throw new Error(
      `nestjs-inertia codegen: shared.export "${exportName}" in "${filePath}" does not look like a ` +
        `${kind === 'type' ? 'type/interface' : 'function'} export (kind: "${kind}"). ` +
        `Found: ${declarations.map((declaration) => declaration.getKindName()).join(', ')}.`,
    );
  }
}

/** Builds the `shared.ts` file contributed by the `shared` option, or throws on misconfiguration. */
export function buildSharedFile(source: SharedPropsSource, ctx: EmitContext): EmittedFile {
  const filePath = resolveModuleFile(ctx.cwd, source.module);
  assertExportShape(ctx, filePath, source.export, source.kind);
  const specifier = toRelativeSpecifier(ctx.outDir, filePath);

  const typeExpression =
    source.kind === 'function'
      ? `Awaited<ReturnType<(typeof import("${specifier}"))["${source.export}"]>>`
      : `import("${specifier}").${source.export}`;

  const contents = [
    '// Auto-generated by @dudousxd/nestjs-inertia-codegen-extension. Do not edit.',
    '// Re-exports the shared-props shape (see the `shared` codegen option) as a type-only',
    '// reference, so no runtime import of server code leaks into the frontend build.',
    '',
    `export type InertiaSharedProps = ${typeExpression};`,
    '',
  ].join('\n');

  return { path: SHARED_FILE_PATH, contents };
}

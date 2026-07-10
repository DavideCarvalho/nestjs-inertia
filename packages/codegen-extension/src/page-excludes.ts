import { sep } from 'node:path';
import type { EmittedFile } from '@dudousxd/nestjs-codegen/extension';
import { type Decorator, type MethodDeclaration, Node, type SourceFile } from 'ts-morph';
import type { EmitContext } from './emit-context.js';

export const PAGE_EXCLUDES_FILE_PATH = 'page-excludes.ts';

/**
 * The `@Inertia()` decorator must resolve to a named import from this specifier — matching
 * by decorator identifier name ALONE would also catch an unrelated `Inertia` decorator from
 * another library. This check is purely static AST inspection (no type checker): it follows
 * named-import aliasing (`import { Inertia as Page } from ...`) but does NOT follow barrel
 * re-exports or namespace imports (`import * as X from '@dudousxd/nestjs-inertia'`) — a page
 * controller importing `Inertia` through anything other than a direct named import from this
 * exact specifier will not be discovered.
 */
const INERTIA_DECORATOR_MODULE = '@dudousxd/nestjs-inertia';
const INERTIA_DECORATOR_NAME = 'Inertia';

/** Same static-import strictness as `INERTIA_DECORATOR_MODULE`, applied to the HTTP verb decorator. */
const HTTP_METHOD_MODULE = '@nestjs/common';
const HTTP_METHOD_DECORATORS: Record<string, string> = {
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Patch: 'PATCH',
  Delete: 'DELETE',
  Options: 'OPTIONS',
  Head: 'HEAD',
  All: 'ALL',
};

type ImportOrigin = { exportedName: string; moduleSpecifier: string };

/**
 * Resolves the local identifier `localName` (as written at the decorator call site) back to
 * its named-import origin via static AST inspection — the exported name and module specifier
 * it was imported from. Returns `undefined` when `localName` isn't a named import in this file.
 */
function resolveNamedImportOrigin(
  sourceFile: SourceFile,
  localName: string,
): ImportOrigin | undefined {
  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
    for (const namedImport of importDeclaration.getNamedImports()) {
      const local = namedImport.getAliasNode()?.getText() ?? namedImport.getName();
      if (local === localName) {
        return { exportedName: namedImport.getName(), moduleSpecifier };
      }
    }
  }
  return undefined;
}

function decoratorMatchesImport(
  decorator: Decorator,
  sourceFile: SourceFile,
  exportedName: string,
  moduleSpecifier: string,
): boolean {
  const localName = decorator.getNameNode().getText();
  const origin = resolveNamedImportOrigin(sourceFile, localName);
  return origin?.exportedName === exportedName && origin.moduleSpecifier === moduleSpecifier;
}

/**
 * Reads the first argument of a decorator factory as a route-path string: a plain string
 * literal (`@Get('foo')`), or the `path` property of an object-literal argument
 * (`@Controller({ path: 'foo' })`). Any other argument shape (array, template expression,
 * identifier, ...) is not statically resolvable and yields `undefined` — treated as "no path
 * segment" by the caller rather than failing the whole scan.
 */
function getFirstLiteralPathArgument(decorator: Decorator): string | undefined {
  const callExpression = decorator.getCallExpression();
  if (!callExpression) return undefined;
  const [firstArgument] = callExpression.getArguments();
  if (!firstArgument) return undefined;

  if (Node.isStringLiteral(firstArgument) || Node.isNoSubstitutionTemplateLiteral(firstArgument)) {
    return firstArgument.getLiteralValue();
  }

  if (Node.isObjectLiteralExpression(firstArgument)) {
    const pathProperty = firstArgument.getProperty('path');
    if (pathProperty && Node.isPropertyAssignment(pathProperty)) {
      const initializer = pathProperty.getInitializer();
      if (
        initializer &&
        (Node.isStringLiteral(initializer) || Node.isNoSubstitutionTemplateLiteral(initializer))
      ) {
        return initializer.getLiteralValue();
      }
    }
  }

  return undefined;
}

/** Joins a controller prefix and a method path into a normalized, leading-slash route path. */
function joinRoutePath(prefix: string, methodPath: string): string {
  const segments = [prefix, methodPath]
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter((segment) => segment.length > 0);
  return `/${segments.join('/')}`;
}

function findHttpMethodDecorator(
  method: MethodDeclaration,
  sourceFile: SourceFile,
): { httpMethod: string; decorator: Decorator } | undefined {
  for (const [decoratorName, httpMethod] of Object.entries(HTTP_METHOD_DECORATORS)) {
    const decorator = method.getDecorator(decoratorName);
    if (
      decorator &&
      decoratorMatchesImport(decorator, sourceFile, decoratorName, HTTP_METHOD_MODULE)
    ) {
      return { httpMethod, decorator };
    }
  }
  return undefined;
}

/** Builds the absolute glob passed to `project().addSourceFilesAtPaths()` from `cwd` + the configured contracts glob. */
function resolveContractsGlobPattern(ctx: EmitContext): string {
  const cwdPosix = ctx.cwd.split(sep).join('/');
  const glob = ctx.config.contracts.glob;
  return glob.startsWith('/') ? glob : `${cwdPosix}/${glob}`;
}

type PageRoute = { path: string; method: string };

/**
 * Scans the contracts glob for `@Controller` classes with `@Inertia(...)`-decorated,
 * HTTP-method-decorated methods, and builds `page-excludes.ts` — a framework-free list of
 * every Inertia page route, to feed `setGlobalPrefix('api', { exclude })`.
 *
 * Throws when zero pages are found: an empty list almost always means the contracts glob
 * doesn't reach the view controllers, which is a misconfiguration worth failing loudly on
 * rather than silently emitting a useless (and dangerous — nothing excluded) empty array.
 */
export function buildPageExcludesFile(ctx: EmitContext): EmittedFile {
  const project = ctx.project();
  const sourceFiles = project.addSourceFilesAtPaths(resolveContractsGlobPattern(ctx));

  const pages: PageRoute[] = [];

  for (const sourceFile of sourceFiles) {
    for (const classDeclaration of sourceFile.getClasses()) {
      const controllerDecorator = classDeclaration.getDecorator('Controller');
      const controllerPrefix = controllerDecorator
        ? (getFirstLiteralPathArgument(controllerDecorator) ?? '')
        : '';

      for (const method of classDeclaration.getMethods()) {
        const inertiaDecorator = method.getDecorator(INERTIA_DECORATOR_NAME);
        if (!inertiaDecorator) continue;
        if (
          !decoratorMatchesImport(
            inertiaDecorator,
            sourceFile,
            INERTIA_DECORATOR_NAME,
            INERTIA_DECORATOR_MODULE,
          )
        ) {
          continue;
        }

        const httpMatch = findHttpMethodDecorator(method, sourceFile);
        if (!httpMatch) continue;

        const methodPath = getFirstLiteralPathArgument(httpMatch.decorator) ?? '';
        pages.push({
          path: joinRoutePath(controllerPrefix, methodPath),
          method: httpMatch.httpMethod,
        });
      }
    }
  }

  if (pages.length === 0) {
    throw new Error(
      `nestjs-inertia codegen: pageExcludes is enabled but no @Inertia page routes were found under contracts glob "${ctx.config.contracts.glob}". This usually means the glob doesn't reach your view controllers, or none of them import \`Inertia\` from "@dudousxd/nestjs-inertia".`,
    );
  }

  pages.sort((a, b) => a.path.localeCompare(b.path));

  const entries = pages
    .map(
      (page) => `  { path: ${JSON.stringify(page.path)}, method: ${JSON.stringify(page.method)} },`,
    )
    .join('\n');

  const contents = [
    '// Auto-generated by @dudousxd/nestjs-inertia-codegen-extension. Do not edit.',
    "/** Every @Inertia page route (path + method) — feed to setGlobalPrefix('api', { exclude }) so page GETs aren't prefixed. */",
    'export const inertiaPageExcludes = [',
    entries,
    '] as const;',
    '',
  ].join('\n');

  return { path: PAGE_EXCLUDES_FILE_PATH, contents };
}

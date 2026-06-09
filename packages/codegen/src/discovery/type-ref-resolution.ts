import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  type ClassDeclaration,
  type InterfaceDeclaration,
  Node,
  type Project,
  type SourceFile,
  type TypeNode,
} from 'ts-morph';
import type { TypeRef } from './types.js';

/**
 * Type-reference resolution: the leaf module of the discovery DAG. Owns the
 * per-invocation discovery context (project root + tsconfig path aliases) and
 * the "follow a name/TypeNode to its declaring file" machinery shared by every
 * other discovery module.
 */

// ---------------------------------------------------------------------------
// Discovery context — scoped per `discoverContractsFast` invocation.
// Saved/restored around each call to prevent cross-call corruption when
// concurrent invocations occur (e.g. in tests or overlapping watcher triggers).
// ---------------------------------------------------------------------------

export interface DiscoveryContext {
  projectRoot: string;
  tsconfigPaths: Record<string, string[]> | null;
}

let _ctx: DiscoveryContext = { projectRoot: '', tsconfigPaths: null };

/** Set the active discovery context, returning the previous one for restoration. */
export function setDiscoveryContext(ctx: DiscoveryContext): DiscoveryContext {
  const prev = _ctx;
  _ctx = ctx;
  return prev;
}

/** Restore a previously-saved discovery context. */
export function restoreDiscoveryContext(ctx: DiscoveryContext): void {
  _ctx = ctx;
}

// Backwards-compatible accessors for internal functions
function _projectRoot(): string {
  return _ctx.projectRoot;
}
function _tsconfigPaths(): Record<string, string[]> | null {
  return _ctx.tsconfigPaths;
}

const _debug = process.env.NESTJS_INERTIA_DEBUG === '1';
export function dbg(...args: unknown[]) {
  if (_debug) console.log('[codegen:debug]', ...args);
}

export function loadTsconfigPaths(tsconfigPath: string): Record<string, string[]> | null {
  try {
    const raw = readFileSync(tsconfigPath, 'utf8');
    // Strip single-line comments (tsconfig allows them)
    const stripped = raw.replace(/\/\/.*$/gm, '');
    const parsed = JSON.parse(stripped) as {
      compilerOptions?: { paths?: Record<string, string[]> };
    };
    return parsed.compilerOptions?.paths ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Type-declaration lookup
// ---------------------------------------------------------------------------

export type TypeDeclResult =
  | { kind: 'class'; decl: ClassDeclaration; file: SourceFile }
  | { kind: 'interface'; decl: InterfaceDeclaration; file: SourceFile }
  | { kind: 'typeAlias'; typeNode: TypeNode | undefined; file: SourceFile; text: string }
  | { kind: 'enum'; members: string[] };

/**
 * Try to find a type declaration (class, interface, type alias, enum) in a source file.
 */
export function findTypeInFile(name: string, file: SourceFile): TypeDeclResult | null {
  const cls = file.getClass(name);
  if (cls) return { kind: 'class', decl: cls, file };

  const iface = file.getInterface(name);
  if (iface) return { kind: 'interface', decl: iface, file };

  const alias = file.getTypeAlias(name);
  if (alias) {
    const typeNode = alias.getTypeNode();
    return {
      kind: 'typeAlias',
      typeNode,
      file,
      text: typeNode ? typeNode.getText() : 'unknown',
    };
  }

  const enumDecl = file.getEnum(name);
  if (enumDecl) {
    const members = enumDecl.getMembers().map((m) => {
      const val = m.getValue();
      // String value → quoted literal ("active"); numeric value → numeric
      // literal (1). Fall back to the member NAME only when the value can't be
      // resolved statically (e.g. a computed member).
      if (typeof val === 'string' || typeof val === 'number') return JSON.stringify(val);
      return JSON.stringify(m.getName());
    });
    return { kind: 'enum', members };
  }

  return null;
}

/**
 * Follow import declarations to find a type in another file.
 */
export function resolveModuleSpecifier(
  moduleSpecifier: string,
  sourceFile: SourceFile,
  _project: Project,
): string[] {
  if (moduleSpecifier.startsWith('.')) {
    const dir = dirname(sourceFile.getFilePath());
    // Strip an explicit ESM `.js`/`.ts` extension so `./x.dto.js` resolves to
    // `./x.dto.ts` (NodeNext import style).
    const noExt = moduleSpecifier.replace(/\.(js|ts)$/, '');
    return [
      resolve(dir, `${noExt}.ts`),
      resolve(dir, `${moduleSpecifier}.ts`),
      resolve(dir, moduleSpecifier, 'index.ts'),
    ];
  }

  // Try to resolve path aliases via tsconfig paths (read directly from JSON)
  const baseUrl = _projectRoot();
  const tsconfigPaths = _tsconfigPaths();

  dbg(
    'resolveModuleSpecifier',
    moduleSpecifier,
    'paths:',
    JSON.stringify(tsconfigPaths),
    'baseUrl:',
    baseUrl,
  );

  if (tsconfigPaths) {
    for (const [pattern, mappings] of Object.entries(tsconfigPaths)) {
      const prefix = pattern.replace('*', '');
      if (moduleSpecifier.startsWith(prefix)) {
        const rest = moduleSpecifier.slice(prefix.length);
        const candidates: string[] = [];
        for (const mapping of mappings) {
          const resolved = resolve(baseUrl, mapping.replace('*', rest));
          candidates.push(`${resolved}.ts`, resolve(resolved, 'index.ts'));
        }
        dbg('  resolved candidates:', candidates);
        return candidates;
      }
    }
  }

  return [];
}

export function resolveImportedType(
  name: string,
  sourceFile: SourceFile,
  project: Project,
): TypeDeclResult | null {
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const namedImport = importDecl.getNamedImports().find((n) => n.getName() === name);
    if (!namedImport) continue;

    const moduleSpecifier = importDecl.getModuleSpecifierValue();
    const candidates = resolveModuleSpecifier(moduleSpecifier, sourceFile, project);
    if (candidates.length === 0) continue;

    for (const candidate of candidates) {
      let importedFile = project.getSourceFile(candidate);
      if (!importedFile) {
        try {
          importedFile = project.addSourceFileAtPath(candidate);
        } catch {
          continue;
        }
      }
      const result = findTypeInFile(name, importedFile);
      if (result) return result;
      // The target module may itself re-export the symbol from elsewhere
      // (`export { X } from './mod'` or `import { X } ...; export { X }`).
      const viaReExport = resolveReExportedType(name, importedFile, project, new Set());
      if (viaReExport) return viaReExport;
    }
  }
  // The current file may re-export the symbol from another module.
  return resolveReExportedType(name, sourceFile, project, new Set());
}

/**
 * Follow `export { X } from './mod'` / `export * from './mod'` re-exports, and
 * bare `export { X }` statements that re-publish a previously-imported symbol,
 * to find a type declaration in a sibling module. Guards against import cycles
 * via `seen`.
 */
function resolveReExportedType(
  name: string,
  file: SourceFile,
  project: Project,
  seen: Set<string>,
): TypeDeclResult | null {
  const filePath = file.getFilePath();
  if (seen.has(filePath)) return null;
  seen.add(filePath);

  for (const exportDecl of file.getExportDeclarations()) {
    const moduleSpecifier = exportDecl.getModuleSpecifierValue();
    const namedExports = exportDecl.getNamedExports();

    // `export { X } from './mod'` — only follow when X (or its alias source) matches.
    if (moduleSpecifier) {
      const hasStar = namedExports.length === 0; // `export * from './mod'`
      const reExportsName = namedExports.some(
        (n) => (n.getAliasNode()?.getText() ?? n.getName()) === name,
      );
      if (!hasStar && !reExportsName) continue;
      // The source-side name (before any alias rename).
      const sourceName = hasStar
        ? name
        : (namedExports
            .find((n) => (n.getAliasNode()?.getText() ?? n.getName()) === name)
            ?.getName() ?? name);
      const target = followModuleForType(sourceName, moduleSpecifier, file, project, seen);
      if (target) return target;
      continue;
    }

    // `export { X }` (no module specifier) — X was imported above into this file.
    const reExportsName = namedExports.some(
      (n) => (n.getAliasNode()?.getText() ?? n.getName()) === name,
    );
    if (!reExportsName) continue;
    const sourceName =
      namedExports.find((n) => (n.getAliasNode()?.getText() ?? n.getName()) === name)?.getName() ??
      name;
    const local = findTypeInFile(sourceName, file);
    if (local) return local;
    const imported = resolveImportedType(sourceName, file, project);
    if (imported) return imported;
  }
  return null;
}

function followModuleForType(
  name: string,
  moduleSpecifier: string,
  fromFile: SourceFile,
  project: Project,
  seen: Set<string>,
): TypeDeclResult | null {
  const candidates = resolveModuleSpecifier(moduleSpecifier, fromFile, project);
  for (const candidate of candidates) {
    let importedFile = project.getSourceFile(candidate);
    if (!importedFile) {
      try {
        importedFile = project.addSourceFileAtPath(candidate);
      } catch {
        continue;
      }
    }
    const result = findTypeInFile(name, importedFile);
    if (result) return result;
    const viaReExport = resolveReExportedType(name, importedFile, project, seen);
    if (viaReExport) return viaReExport;
  }
  return null;
}

/**
 * Find a type declaration by name: first in the current file, then by following imports.
 */
export function findType(
  name: string,
  sourceFile: SourceFile,
  project: Project,
): TypeDeclResult | null {
  const local = findTypeInFile(name, sourceFile);
  if (local) return local;
  return resolveImportedType(name, sourceFile, project);
}

// ---------------------------------------------------------------------------
// Importable named-ref resolution
// ---------------------------------------------------------------------------

/** The declaration kinds a `resolveTypeRef` call will accept as an importable ref. */
export type TypeRefKind = 'class' | 'interface' | 'typeAlias' | 'enum';

export interface ResolveTypeRefOptions {
  /**
   * Declaration kinds accepted as an importable named ref (applied identically
   * to local and imported declarations). The two call sites differ only here:
   *   - body/query/response refs accept class + interface;
   *   - `@FilterFor` param refs also accept enum + type alias.
   */
  kinds: TypeRefKind[];
  /**
   * Honour a bare (node_modules) import specifier — emit `{ name, filePath: spec }`
   * so the emitter imports straight from the package. tsconfig path aliases are
   * excluded (they resolve to files instead). Off for the body/query/response
   * path (which only ever points at project source files).
   */
  allowBareSpecifier?: boolean;
  /**
   * Unwrap `Promise<T>`, `Array<T>` and `T[]` to the inner named type (marking
   * array forms with `isArray`). Used for the body/query/response path which
   * receives a raw return/param `TypeNode`; the `@FilterFor` path passes a bare
   * symbol name and needs no unwrapping.
   */
  unwrapContainers?: boolean;
}

/** Skip-list of primitive / well-known names that never resolve to a named ref. */
const _NON_REF_NAMES = new Set(['string', 'number', 'boolean', 'void', 'unknown', 'any', 'Date']);

/** Does an exported declaration found by `findTypeInFile` match the accepted kinds? */
function _localDeclForKinds(name: string, file: SourceFile, kinds: TypeRefKind[]): boolean {
  if (kinds.includes('class') && file.getClass(name)?.isExported()) return true;
  if (kinds.includes('interface') && file.getInterface(name)?.isExported()) return true;
  if (kinds.includes('typeAlias') && file.getTypeAlias(name)?.isExported()) return true;
  if (kinds.includes('enum') && file.getEnum(name)?.isExported()) return true;
  return false;
}

/**
 * Resolve a type reference to an importable `TypeRef` — the symbol name plus the
 * absolute path of its declaring source file (for a relative import) OR the bare
 * module specifier (for a node_modules package). Accepts either a raw `TypeNode`
 * (with `unwrapContainers` to peel `Promise`/`Array`) or a bare symbol name.
 *
 * Walks: local exported decl → `{ name, thisFile }`; else the file's import
 * declarations to a matching exported decl → `{ name, importedFile }`. The
 * accepted declaration kinds (and bare-specifier / container-unwrap support) are
 * controlled by `opts`, letting both former resolvers share this one body.
 * Returns null when the symbol is not exported, not resolvable, or its import
 * path cannot be safely computed.
 */
export function resolveTypeRef(
  nodeOrName: TypeNode | string,
  sourceFile: SourceFile,
  project: Project,
  opts: ResolveTypeRefOptions,
): TypeRef | null {
  // ── Resolve the bare symbol name (peeling containers for the TypeNode form) ──
  let name: string;
  if (typeof nodeOrName === 'string') {
    name = nodeOrName;
  } else {
    const typeNode = nodeOrName;

    if (opts.unwrapContainers && Node.isArrayTypeNode(typeNode)) {
      const inner = resolveTypeRef(typeNode.getElementTypeNode(), sourceFile, project, opts);
      return inner ? { ...inner, isArray: true } : null;
    }

    if (!Node.isTypeReference(typeNode)) return null;
    const typeName = typeNode.getTypeName();
    const refName = Node.isIdentifier(typeName) ? typeName.getText() : null;
    if (!refName) return null;

    if (opts.unwrapContainers && refName === 'Promise') {
      const first = typeNode.getTypeArguments()[0];
      return first ? resolveTypeRef(first, sourceFile, project, opts) : null;
    }
    if (opts.unwrapContainers && refName === 'Array') {
      const first = typeNode.getTypeArguments()[0];
      if (!first) return null;
      const inner = resolveTypeRef(first, sourceFile, project, opts);
      return inner ? { ...inner, isArray: true } : null;
    }

    if (_NON_REF_NAMES.has(refName)) return null;
    name = refName;
  }

  // 1. Declared (and exported) in the current file → relative import to it.
  if (_localDeclForKinds(name, sourceFile, opts.kinds)) {
    return { name, filePath: sourceFile.getFilePath() };
  }

  // 2. Imported from another module — follow the import declaration.
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const namedImport = importDecl.getNamedImports().find((n) => n.getName() === name);
    if (!namedImport) continue;
    const moduleSpecifier = importDecl.getModuleSpecifierValue();

    // Bare specifier (node_modules package) → import directly by specifier.
    if (
      opts.allowBareSpecifier &&
      !moduleSpecifier.startsWith('.') &&
      !moduleSpecifier.startsWith('/')
    ) {
      // Only honour it if not a tsconfig path alias (those resolve to files).
      const tsconfigPaths = _tsconfigPaths();
      const isAlias =
        tsconfigPaths != null &&
        Object.keys(tsconfigPaths).some((p) => {
          const prefix = p.replace('*', '');
          return moduleSpecifier.startsWith(prefix);
        });
      if (!isAlias) {
        return { name, filePath: moduleSpecifier };
      }
    }

    // Local / aliased source file → resolve to its absolute path so the emitter
    // can compute a relative import from the generated output dir.
    const candidates = resolveModuleSpecifier(moduleSpecifier, sourceFile, project);
    for (const candidate of candidates) {
      let importedFile = project.getSourceFile(candidate);
      if (!importedFile) {
        try {
          importedFile = project.addSourceFileAtPath(candidate);
        } catch {
          continue;
        }
      }
      if (_localDeclForKinds(name, importedFile, opts.kinds)) {
        return { name, filePath: importedFile.getFilePath() };
      }
    }
  }

  return null;
}

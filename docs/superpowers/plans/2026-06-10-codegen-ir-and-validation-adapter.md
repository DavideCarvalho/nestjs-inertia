# Codegen IR + ValidationAdapter Abstraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a neutral validation IR (`SchemaNode`) and a `ValidationAdapter` interface inside `@dudousxd/nestjs-inertia-codegen`, refactoring the zod-hardcoded `dto-to-zod.ts` into `dto-to-ir.ts` + a zod adapter — with the emitted output byte-identical to today.

**Architecture:** Sub-project #1 of the extensible-codegen design (`docs/superpowers/specs/2026-06-10-nestjs-codegen-extensible-architecture-design.md`). The AST walker stops producing zod text directly; it produces a `SchemaModule` (IR). A pluggable `ValidationAdapter` renders the IR back to source text. The zod adapter is the first/default adapter and must reproduce current output exactly. The existing `test/discovery/dto-to-zod.spec.ts` is the regression gate — it must keep passing unchanged.

**Tech Stack:** TypeScript, ts-morph (AST), vitest. Package: `packages/codegen`.

---

## File Structure

- Create `src/ir/schema-node.ts` — the `SchemaNode` / `SchemaModule` IR types (pure types, no logic).
- Create `src/adapters/types.ts` — `ValidationAdapter`, `AdapterUsage`, `RenderContext` interfaces.
- Create `src/adapters/zod.ts` — `zodAdapter: ValidationAdapter` rendering `SchemaNode` → zod text identical to current output.
- Create `src/discovery/dto-to-ir.ts` — `extractSchemaFromDto()` returning `SchemaModule` (ports the AST walk from `dto-to-zod.ts`).
- Modify `src/discovery/dto-to-zod.ts` — `extractZodFromDto()` becomes a thin wrapper: `renderModule(zodAdapter, extractSchemaFromDto(...))`. Public signature + `DtoZodResult` shape unchanged.
- Create `src/adapters/registry.ts` — `resolveAdapter(name | adapter)` returning a `ValidationAdapter` (only `'zod'` wired here; others throw "not yet available").
- Modify `src/config/types.ts` — add `validation?` to `UserConfig` and `validation: ValidationAdapter` to `ResolvedConfig`.
- Modify `src/config/define-config.ts` / `src/config/load-config.ts` — resolve `validation` (default `'zod'`).
- Test files mirror under `test/` with `.spec.ts`.

**Regression gate:** `test/discovery/dto-to-zod.spec.ts` and `test/discovery/contracts-fast*.spec.ts` and `test/emit/*` must keep passing unchanged at every step after Task 5.

---

### Task 1: SchemaNode IR types

**Files:**
- Create: `src/ir/schema-node.ts`
- Test: `test/ir/schema-node.spec.ts`

- [ ] **Step 1: Write the IR types**

```ts
// src/ir/schema-node.ts
/** Neutral validation IR. Produced by dto-to-ir and by parsing defineContract zod. */
export type StringCheck =
  | { check: 'email' }
  | { check: 'url' }
  | { check: 'uuid' }
  | { check: 'regex'; source: string; flags: string }
  | { check: 'min'; value: number; message?: string }
  | { check: 'max'; value: number; message?: string }
  | { check: 'length'; value: number; message?: string }
  | { check: 'nonempty'; message?: string };

export type NumberCheck =
  | { check: 'int' }
  | { check: 'min'; value: number; message?: string }
  | { check: 'max'; value: number; message?: string }
  | { check: 'positive' }
  | { check: 'negative' };

export type SchemaNode =
  | { kind: 'string'; checks?: StringCheck[] }
  | { kind: 'number'; checks?: NumberCheck[] }
  | { kind: 'boolean' }
  | { kind: 'date' }
  | { kind: 'enum'; values: string[]; numeric?: boolean }
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'object'; fields: Record<string, SchemaNode> }
  | { kind: 'array'; element: SchemaNode }
  | { kind: 'union'; options: SchemaNode[] }
  | { kind: 'optional'; inner: SchemaNode }
  | { kind: 'nullable'; inner: SchemaNode }
  | { kind: 'ref'; name: string }
  | { kind: 'unknown'; reason: string; rawText?: string };

/** A root schema plus hoisted named (nested/recursive) schemas. */
export interface SchemaModule {
  root: SchemaNode;
  named: Map<string, SchemaNode>;
  warnings: string[];
}
```

- [ ] **Step 2: Write a type-level smoke test**

```ts
// test/ir/schema-node.spec.ts
import { describe, expect, it } from 'vitest';
import type { SchemaModule, SchemaNode } from '../../src/ir/schema-node.js';

describe('SchemaNode IR', () => {
  it('constructs a nested object module', () => {
    const node: SchemaNode = {
      kind: 'object',
      fields: { email: { kind: 'string', checks: [{ check: 'email' }] } },
    };
    const mod: SchemaModule = { root: node, named: new Map(), warnings: [] };
    expect(mod.root.kind).toBe('object');
  });
});
```

- [ ] **Step 3: Run**

Run: `pnpm --filter @dudousxd/nestjs-inertia-codegen test -- test/ir/schema-node.spec.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/codegen/src/ir/schema-node.ts packages/codegen/test/ir/schema-node.spec.ts
git commit -m "feat(codegen): add SchemaNode validation IR"
```

---

### Task 2: ValidationAdapter interface

**Files:**
- Create: `src/adapters/types.ts`
- Test: covered indirectly by Task 3.

- [ ] **Step 1: Write the interface**

```ts
// src/adapters/types.ts
import type { SchemaModule, SchemaNode } from '../ir/schema-node.js';

/** What an adapter must import to render a given module (deduped by caller). */
export interface AdapterUsage {
  /** Whether the module uses any schema at all (drives import emission). */
  used: boolean;
}

export interface RenderContext {
  /** Hoisted named schemas being emitted alongside the root. */
  named: Map<string, SchemaNode>;
}

export interface RenderedModule {
  /** Root schema source text, e.g. "z.object({ email: z.string().email() })". */
  schemaText: string;
  /** name → schema source text, hoisted above the parent. */
  namedNestedSchemas: Map<string, string>;
  warnings: string[];
}

export interface ValidationAdapter {
  /** 'zod' | 'valibot' | 'arktype'. */
  name: string;
  /** Import lines required for any rendered text (e.g. "import { z } from 'zod'"). */
  importStatements(usage: AdapterUsage): string[];
  /** Render a single SchemaNode to this lib's source text. */
  render(node: SchemaNode, ctx: RenderContext): string;
  /** Render a full module (root + hoisted named) to text. */
  renderModule(mod: SchemaModule): RenderedModule;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/codegen/src/adapters/types.ts
git commit -m "feat(codegen): add ValidationAdapter interface"
```

---

### Task 3: Zod adapter (IR → zod text)

**Files:**
- Create: `src/adapters/zod.ts`
- Test: `test/adapters/zod.spec.ts`

This adapter must reproduce the exact text strings currently produced by
`dto-to-zod.ts`. Cross-check every branch against the assertions in
`test/discovery/dto-to-zod.spec.ts` (e.g. `z.object({ a: z.string() })`,
`z.string().email()`, `z.number().int()`, `z.coerce.date()`, `.optional()`,
`.nullable()`, arrays as `z.array(...)`, enums as `z.enum([...])` / numeric unions).

- [ ] **Step 1: Write failing tests for the renderer**

```ts
// test/adapters/zod.spec.ts
import { describe, expect, it } from 'vitest';
import { zodAdapter } from '../../src/adapters/zod.js';
import type { SchemaModule } from '../../src/ir/schema-node.js';

function render(mod: SchemaModule) {
  return zodAdapter.renderModule(mod);
}
const obj = (fields: Record<string, any>): SchemaModule => ({
  root: { kind: 'object', fields },
  named: new Map(),
  warnings: [],
});

describe('zodAdapter', () => {
  it('string with email check', () => {
    expect(render(obj({ a: { kind: 'string', checks: [{ check: 'email' }] } })).schemaText).toBe(
      'z.object({ a: z.string().email() })',
    );
  });
  it('int number', () => {
    expect(render(obj({ a: { kind: 'number', checks: [{ check: 'int' }] } })).schemaText).toBe(
      'z.object({ a: z.number().int() })',
    );
  });
  it('date → coerce.date', () => {
    expect(render(obj({ a: { kind: 'date' } })).schemaText).toBe('z.object({ a: z.coerce.date() })');
  });
  it('optional + nullable wrappers', () => {
    expect(
      render(obj({ a: { kind: 'optional', inner: { kind: 'string' } } })).schemaText,
    ).toBe('z.object({ a: z.string().optional() })');
  });
  it('array of strings', () => {
    expect(
      render(obj({ a: { kind: 'array', element: { kind: 'string' } } })).schemaText,
    ).toBe('z.object({ a: z.array(z.string()) })');
  });
  it('enum', () => {
    expect(
      render(obj({ a: { kind: 'enum', values: ['x', 'y'] } })).schemaText,
    ).toBe("z.object({ a: z.enum(['x', 'y']) })");
  });
  it('importStatements when used', () => {
    expect(zodAdapter.importStatements({ used: true })).toEqual(["import { z } from 'zod';"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dudousxd/nestjs-inertia-codegen test -- test/adapters/zod.spec.ts`
Expected: FAIL ("Cannot find module ../../src/adapters/zod.js")

- [ ] **Step 3: Implement the zod adapter**

```ts
// src/adapters/zod.ts
import type { SchemaModule, SchemaNode } from '../ir/schema-node.js';
import type { AdapterUsage, RenderContext, RenderedModule, ValidationAdapter } from './types.js';

function renderString(checks: SchemaNode extends { kind: 'string' } ? unknown : never) {
  return '';
}

function render(node: SchemaNode, ctx: RenderContext): string {
  switch (node.kind) {
    case 'string': {
      let s = 'z.string()';
      for (const c of node.checks ?? []) {
        if (c.check === 'email') s += '.email()';
        else if (c.check === 'url') s += '.url()';
        else if (c.check === 'uuid') s += '.uuid()';
        else if (c.check === 'nonempty') s += c.message ? `.min(1, ${JSON.stringify(c.message)})` : '.min(1)';
        else if (c.check === 'min') s += c.message ? `.min(${c.value}, ${JSON.stringify(c.message)})` : `.min(${c.value})`;
        else if (c.check === 'max') s += c.message ? `.max(${c.value}, ${JSON.stringify(c.message)})` : `.max(${c.value})`;
        else if (c.check === 'length') s += `.length(${c.value})`;
        else if (c.check === 'regex') s += `.regex(/${c.source}/${c.flags})`;
      }
      return s;
    }
    case 'number': {
      let s = 'z.number()';
      for (const c of node.checks ?? []) {
        if (c.check === 'int') s += '.int()';
        else if (c.check === 'positive') s += '.positive()';
        else if (c.check === 'negative') s += '.negative()';
        else if (c.check === 'min') s += `.min(${c.value})`;
        else if (c.check === 'max') s += `.max(${c.value})`;
      }
      return s;
    }
    case 'boolean':
      return 'z.boolean()';
    case 'date':
      return 'z.coerce.date()';
    case 'enum':
      return node.numeric
        ? `z.union([${node.values.map((v) => `z.literal(${v})`).join(', ')}])`
        : `z.enum([${node.values.map((v) => `'${v}'`).join(', ')}])`;
    case 'literal':
      return `z.literal(${typeof node.value === 'string' ? `'${node.value}'` : node.value})`;
    case 'object': {
      const inner = Object.entries(node.fields)
        .map(([k, v]) => `${k}: ${render(v, ctx)}`)
        .join(', ');
      return inner ? `z.object({ ${inner} })` : 'z.object({})';
    }
    case 'array':
      return `z.array(${render(node.element, ctx)})`;
    case 'union':
      return `z.union([${node.options.map((o) => render(o, ctx)).join(', ')}])`;
    case 'optional':
      return `${render(node.inner, ctx)}.optional()`;
    case 'nullable':
      return `${render(node.inner, ctx)}.nullable()`;
    case 'ref':
      return node.name;
    case 'unknown':
      return node.rawText ?? 'z.unknown()';
  }
}

export const zodAdapter: ValidationAdapter = {
  name: 'zod',
  importStatements(usage: AdapterUsage): string[] {
    return usage.used ? ["import { z } from 'zod';"] : [];
  },
  render,
  renderModule(mod: SchemaModule): RenderedModule {
    const ctx: RenderContext = { named: mod.named };
    const namedNestedSchemas = new Map<string, string>();
    for (const [name, node] of mod.named) {
      namedNestedSchemas.set(name, render(node, ctx));
    }
    return { schemaText: render(mod.root, ctx), namedNestedSchemas, warnings: mod.warnings };
  },
};
```

> NOTE during implementation: delete the placeholder `renderString` stub above — it
> exists only to show the file shape. Reconcile every emitted string against
> `test/discovery/dto-to-zod.spec.ts`; if any assertion there expects different text
> (e.g. message formatting, `.min(1)` vs `.nonempty()`), adjust this renderer to match
> the existing output exactly. The existing spec is authoritative.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @dudousxd/nestjs-inertia-codegen test -- test/adapters/zod.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/adapters/zod.ts packages/codegen/test/adapters/zod.spec.ts
git commit -m "feat(codegen): zod ValidationAdapter renders SchemaNode IR"
```

---

### Task 4: dto-to-ir extractor (AST → SchemaModule)

**Files:**
- Create: `src/discovery/dto-to-ir.ts`
- Test: `test/discovery/dto-to-ir.spec.ts`

Port the AST-walking logic from `src/discovery/dto-to-zod.ts` (the `extractZodFromDto`
internals: `KNOWN_DECORATORS`, per-property decorator inspection, nested
`@ValidateNested()`/`@Type()` recursion, enum/array handling, recursion guard, warnings)
so that instead of appending zod text it builds `SchemaNode` values. Keep the same
control flow, the same `BuildContext` bookkeeping (`namedNestedSchemas`, `warnings`,
`emittedClasses`, `visiting`, `recursiveSchemas`), but emit IR.

- [ ] **Step 1: Write failing tests mirroring the decorator table (IR shape)**

```ts
// test/discovery/dto-to-ir.spec.ts
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { extractSchemaFromDto } from '../../src/discovery/dto-to-ir.js';

function ir(source: string, className = 'Dto') {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
  const file = project.createSourceFile('dto.ts', source);
  return extractSchemaFromDto(file.getClassOrThrow(className), file, project);
}

describe('extractSchemaFromDto', () => {
  it('@IsEmail → string with email check', () => {
    const mod = ir('class Dto { @IsEmail() a!: string; }');
    expect(mod.root).toEqual({
      kind: 'object',
      fields: { a: { kind: 'string', checks: [{ check: 'email' }] } },
    });
  });

  it('@IsInt → number with int check', () => {
    const mod = ir('class Dto { @IsInt() a!: number; }');
    expect(mod.root.kind).toBe('object');
    expect((mod.root as any).fields.a).toEqual({ kind: 'number', checks: [{ check: 'int' }] });
  });

  it('@IsOptional wraps in optional', () => {
    const mod = ir('class Dto { @IsString() @IsOptional() a?: string; }');
    expect((mod.root as any).fields.a).toEqual({ kind: 'optional', inner: { kind: 'string' } });
  });

  it('@IsEnum → enum node', () => {
    const mod = ir("enum E { A = 'a', B = 'b' } class Dto { @IsEnum(E) a!: E; }");
    expect((mod.root as any).fields.a.kind).toBe('enum');
    expect((mod.root as any).fields.a.values).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dudousxd/nestjs-inertia-codegen test -- test/discovery/dto-to-ir.spec.ts`
Expected: FAIL ("Cannot find module ../../src/discovery/dto-to-ir.js")

- [ ] **Step 3: Implement `extractSchemaFromDto`**

Port `src/discovery/dto-to-zod.ts` verbatim in structure, replacing string-building with
IR-node construction. Concretely:
- Copy `KNOWN_DECORATORS`, `BuildContext`, the property loop, the nested-class recursion,
  the enum resolution (reuse `./enum-resolution.js`), the array/`@Type()` handling, and
  the recursion guard.
- Where the original appended `'z.string()'` etc., instead build `{ kind: 'string', checks }`.
- Where it pushed a hoisted nested schema text into `namedNestedSchemas`, push a
  `SchemaNode` into `mod.named` keyed by the same emitted name; reference it with
  `{ kind: 'ref', name }`.
- Where it pushed a warning for an unmappable decorator, push the same warning string and
  emit `{ kind: 'unknown', reason }` for that field.
- Return `{ root, named, warnings }` as a `SchemaModule`.

Signature:

```ts
// src/discovery/dto-to-ir.ts
import type { ClassDeclaration, Project, SourceFile } from 'ts-morph';
import type { SchemaModule } from '../ir/schema-node.js';

export function extractSchemaFromDto(
  classDecl: ClassDeclaration,
  sourceFile: SourceFile,
  project: Project,
): SchemaModule {
  // ... ported AST walk producing SchemaNode values ...
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @dudousxd/nestjs-inertia-codegen test -- test/discovery/dto-to-ir.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/discovery/dto-to-ir.ts packages/codegen/test/discovery/dto-to-ir.spec.ts
git commit -m "feat(codegen): dto-to-ir extracts SchemaNode from class-validator DTOs"
```

---

### Task 5: Rewire `extractZodFromDto` as IR + adapter (regression gate)

**Files:**
- Modify: `src/discovery/dto-to-zod.ts`
- Gate: `test/discovery/dto-to-zod.spec.ts` (UNCHANGED — must pass)

- [ ] **Step 1: Replace the body of `extractZodFromDto` with a wrapper**

```ts
// src/discovery/dto-to-zod.ts  (keep the existing exports + DtoZodResult shape)
import type { ClassDeclaration, Project, SourceFile } from 'ts-morph';
import { zodAdapter } from '../adapters/zod.js';
import { extractSchemaFromDto } from './dto-to-ir.js';

export interface DtoZodResult {
  schemaText: string;
  namedNestedSchemas: Map<string, string>;
  warnings: string[];
}

export function extractZodFromDto(
  classDecl: ClassDeclaration,
  sourceFile: SourceFile,
  project: Project,
): DtoZodResult {
  const mod = extractSchemaFromDto(classDecl, sourceFile, project);
  const rendered = zodAdapter.renderModule(mod);
  return {
    schemaText: rendered.schemaText,
    namedNestedSchemas: rendered.namedNestedSchemas,
    warnings: rendered.warnings,
  };
}
```

Delete the now-unused internal AST-walking helpers from `dto-to-zod.ts` (they moved to
`dto-to-ir.ts`).

- [ ] **Step 2: Run the FULL existing dto-to-zod spec (the golden gate)**

Run: `pnpm --filter @dudousxd/nestjs-inertia-codegen test -- test/discovery/dto-to-zod.spec.ts`
Expected: PASS — every assertion unchanged. Any failure means the zod adapter (Task 3) or
dto-to-ir (Task 4) diverged from current output; fix the renderer/extractor until green.

- [ ] **Step 3: Run the whole codegen suite (catch downstream drift)**

Run: `pnpm --filter @dudousxd/nestjs-inertia-codegen test`
Expected: PASS — including `contracts-fast*.spec.ts` and `emit/*` which consume
`extractZodFromDto` output via `ContractSource.bodyZodText`/`formNestedSchemas`.

- [ ] **Step 4: Commit**

```bash
git add packages/codegen/src/discovery/dto-to-zod.ts
git commit -m "refactor(codegen): extractZodFromDto routes through IR + zod adapter (output unchanged)"
```

---

### Task 6: Adapter registry + `validation` config

**Files:**
- Create: `src/adapters/registry.ts`
- Modify: `src/config/types.ts`, `src/config/load-config.ts`
- Test: `test/adapters/registry.spec.ts`, extend `test/config/*`

- [ ] **Step 1: Write failing registry test**

```ts
// test/adapters/registry.spec.ts
import { describe, expect, it } from 'vitest';
import { resolveAdapter } from '../../src/adapters/registry.js';
import { zodAdapter } from '../../src/adapters/zod.js';

describe('resolveAdapter', () => {
  it("'zod' → zodAdapter", () => {
    expect(resolveAdapter('zod')).toBe(zodAdapter);
  });
  it('passes through a custom adapter object', () => {
    const custom = { ...zodAdapter, name: 'custom' };
    expect(resolveAdapter(custom)).toBe(custom);
  });
  it("throws a clear error for not-yet-available adapters", () => {
    expect(() => resolveAdapter('valibot')).toThrow(/valibot.*not yet available/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @dudousxd/nestjs-inertia-codegen test -- test/adapters/registry.spec.ts`
Expected: FAIL

- [ ] **Step 3: Implement the registry**

```ts
// src/adapters/registry.ts
import { ConfigError } from '../exceptions.js';
import type { ValidationAdapter } from './types.js';
import { zodAdapter } from './zod.js';

export type ValidationOption = 'zod' | 'valibot' | 'arktype' | ValidationAdapter;

export function resolveAdapter(option: ValidationOption): ValidationAdapter {
  if (typeof option !== 'string') return option;
  if (option === 'zod') return zodAdapter;
  throw new ConfigError(
    `Validation adapter "${option}" is not yet available. Only "zod" ships today; ` +
      `valibot and arktype adapters arrive in a later sub-project.`,
  );
}
```

- [ ] **Step 4: Add config fields**

In `src/config/types.ts`, add to `UserConfig`:

```ts
  /** Validation lib for emitted schemas. Default: 'zod'. */
  validation?: import('../adapters/registry.js').ValidationOption;
```

and to `ResolvedConfig`:

```ts
  validation: import('../adapters/types.js').ValidationAdapter;
```

In `src/config/load-config.ts`, resolve it (default `'zod'`):

```ts
import { resolveAdapter } from '../adapters/registry.js';
// ...inside the resolve step:
validation: resolveAdapter(userConfig.validation ?? 'zod'),
```

- [ ] **Step 5: Run config + registry tests**

Run: `pnpm --filter @dudousxd/nestjs-inertia-codegen test -- test/adapters/registry.spec.ts test/config`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/codegen/src/adapters/registry.ts packages/codegen/src/config/ packages/codegen/test/adapters/registry.spec.ts packages/codegen/test/config
git commit -m "feat(codegen): adapter registry + validation config (zod default)"
```

---

### Task 7: Thread the resolved adapter through emit (zod = unchanged output)

**Files:**
- Modify: `src/emit/emit-forms.ts`, `src/generate.ts`
- Gate: `test/emit/*.spec.ts` (UNCHANGED — must pass)

Today `emit-forms.ts` hardcodes the `z` import (via `forms.zodImport`) and assumes zod
text. Route the import line through the resolved adapter's `importStatements()` so the
import is adapter-owned, without changing zod output.

- [ ] **Step 1: Pass the adapter into `emitForms`**

In `src/generate.ts`, where `emitForms(routes, config.codegen.outDir, config.forms)` is
called, also pass `config.validation`:

```ts
const hasForms = await emitForms(routes, config.codegen.outDir, config.forms, config.validation);
```

In `src/emit/emit-forms.ts`, change the signature:

```ts
import type { ValidationAdapter } from '../adapters/types.js';
// ...
export async function emitForms(
  routes: RouteDescriptor[],
  outDir: string,
  config?: ResolvedFormsConfig,
  adapter?: ValidationAdapter,
): Promise<boolean> {
```

and replace the hardcoded `import { z } from '<zodImport>'` line with:

```ts
const importLines = (adapter?.importStatements({ used: true }) ?? ["import { z } from 'zod';"]);
// emit importLines at the top of forms.ts instead of the previous single z-import line
```

> Keep `forms.zodImport` honored when `adapter.name === 'zod'` (back-compat): if a custom
> `zodImport` is set, substitute it into the zod import line. Reconcile against
> `test/emit/emit-forms*.spec.ts` so the emitted header is byte-identical for the zod path.

- [ ] **Step 2: Run the emit suite (gate)**

Run: `pnpm --filter @dudousxd/nestjs-inertia-codegen test -- test/emit`
Expected: PASS — forms.ts output unchanged for zod.

- [ ] **Step 3: Run the full suite + typecheck**

Run: `pnpm --filter @dudousxd/nestjs-inertia-codegen test && pnpm --filter @dudousxd/nestjs-inertia-codegen typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/codegen/src/emit/emit-forms.ts packages/codegen/src/generate.ts
git commit -m "feat(codegen): emit-forms imports are adapter-driven (zod output unchanged)"
```

---

## Self-Review

**Spec coverage (against the §9 sub-project #1 scope):**
- "Add SchemaNode/SchemaModule IR" → Task 1. ✓
- "Refactor dto-to-zod → dto-to-ir" → Task 4. ✓
- "Define ValidationAdapter; implement zod adapter in-tree" → Tasks 2, 3. ✓
- "Make emit-forms (and form-schema parts of emit-api) adapter-driven" → Task 7 (forms).
  emit-api's form-schema reuse flows through the same `ContractSource` text fields, which
  remain zod text via Task 5; no api.ts change needed in this sub-project (the api emit
  refactor is sub-project #3). Noted, not a gap.
- "Invariant: zod output unchanged (golden tests)" → Tasks 5, 7 gates on existing specs. ✓
- `validation` config plumbing → Task 6 (needed so later sub-projects can switch libs). ✓

**Placeholder scan:** The `renderString` stub in Task 3 Step 3 is explicitly flagged for
deletion in the following NOTE; not a silent placeholder. No TBD/TODO elsewhere.

**Type consistency:** `SchemaModule { root, named, warnings }` is used identically in
Tasks 1, 3, 4, 5. `ValidationAdapter.renderModule → RenderedModule { schemaText,
namedNestedSchemas, warnings }` maps 1:1 onto the existing `DtoZodResult` shape in Task 5.
`resolveAdapter`/`ValidationOption` names match between Task 6 registry and the config
import. `extractSchemaFromDto(classDecl, sourceFile, project)` signature matches between
Task 4 definition and Task 5 caller.

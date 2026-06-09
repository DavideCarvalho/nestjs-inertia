import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverContractsFast } from '../../src/discovery/contracts-fast.js';
import type { FilterFieldType } from '../../src/discovery/types.js';
import { emitApi } from '../../src/emit/emit-api.js';

const FIXTURES = join(__dirname, '..', '__fixtures__', 'app');

async function discover(glob: string, routeName: string) {
  const routes = await discoverContractsFast({ cwd: FIXTURES, glob });
  const route = routes.find((r) => r.name === routeName);
  expect(route).toBeDefined();
  return route!.contract!.contractSource;
}

describe('@FilterFor method-parameter type inference (discovery)', () => {
  it('infers virtual field types from the first parameter type', async () => {
    const cs = await discover('filter-for-param.controller.ts', 'filterForParam.list');
    const fts = cs.filterFieldTypes as FilterFieldType[];
    const byName = Object.fromEntries(fts.map((f) => [f.name, f]));

    // (a) primitive number param, no hint → number.
    expect(byName.minAge.kind).toBe('number');
    expect(byName.minAge.typeRef).toBeUndefined();

    // (b) named local enum param → typeRef carrying the symbol name + file.
    expect(byName.state.typeRef).toBeDefined();
    expect(byName.state.typeRef?.name).toBe('Status');
    expect(byName.state.typeRef?.filePath).toMatch(/filter-for-param\.controller\.ts$/);

    // (c) literal union param → inline union, no typeRef.
    expect(byName.mode.kind).toBe('string');
    expect(byName.mode.enumValues).toEqual(['draft', 'published']);
    expect(byName.mode.typeRef).toBeUndefined();

    // (d) explicit { type } hint OVERRIDES the (string) param type → number.
    expect(byName.score.kind).toBe('number');
    expect(byName.score.typeRef).toBeUndefined();

    // (e) `any` param → unresolvable → skipped entirely.
    expect(byName.blob).toBeUndefined();
  });

  it('keeps filterFields in sync (skips the any-param key)', async () => {
    const cs = await discover('filter-for-param.controller.ts', 'filterForParam.list');
    expect(cs.filterFields).toEqual((cs.filterFieldTypes as FilterFieldType[]).map((f) => f.name));
    expect(cs.filterFields).not.toContain('blob');
  });

  it('resolves a typeRef for enums/aliases imported from another file', async () => {
    const cs = await discover(
      'filter-for-param-imported.controller.ts',
      'filterForParamImported.list',
    );
    const fts = cs.filterFieldTypes as FilterFieldType[];
    const byName = Object.fromEntries(fts.map((f) => [f.name, f]));

    expect(byName.role.typeRef?.name).toBe('Role');
    expect(byName.role.typeRef?.filePath).toMatch(/dto\/role\.enum\.ts$/);
    expect(byName.tier.typeRef?.name).toBe('Tier');
    expect(byName.tier.typeRef?.filePath).toMatch(/dto\/role\.enum\.ts$/);
  });
});

describe('@FilterFor method-parameter type inference (emit)', () => {
  let outDir: string;
  afterEach(async () => {
    if (outDir) await rm(outDir, { recursive: true, force: true });
  });

  it('emits a local-enum named import + references it in the type map M', async () => {
    const routes = await discoverContractsFast({
      cwd: FIXTURES,
      glob: 'filter-for-param.controller.ts',
    });
    outDir = await mkdtemp(join(tmpdir(), 'filter-for-param-emit-'));
    await emitApi(routes, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');

    // Real `import type { Status } from '<relative path>'` for the local enum.
    expect(content).toMatch(
      /import type \{ Status \} from '\.\.?\/[^']*filter-for-param\.controller(\.js)?';/,
    );

    // Map line: primitive inferred (number), enum referenced by name (Status),
    // literal union inlined (mode), hint override (score → number); blob absent.
    expect(content).toContain(
      'filterQuery: () => _filterQueryTyped<"minAge" | "state" | "mode" | "score", ' +
        '{ "minAge": number; "state": Status; "mode": "draft" | "published"; "score": number }>(),',
    );
  });

  it('emits a relative import to another file for cross-file enums/aliases', async () => {
    const routes = await discoverContractsFast({
      cwd: FIXTURES,
      glob: 'filter-for-param-imported.controller.ts',
    });
    outDir = await mkdtemp(join(tmpdir(), 'filter-for-param-imp-emit-'));
    await emitApi(routes, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');

    expect(content).toMatch(
      /import type \{[^}]*\bRole\b[^}]*\} from '[^']*dto\/role\.enum(\.js)?';/,
    );
    expect(content).toMatch(
      /import type \{[^}]*\bTier\b[^}]*\} from '[^']*dto\/role\.enum(\.js)?';/,
    );
    expect(content).toContain('{ "role": Role; "tier": Tier }');
  });

  // Regression: a NON-exported named type can't be `import type`-ed. The codegen
  // must never emit a guessed import or a dangling name. A non-exported ENUM is
  // safely expanded to its literal values; a non-exported type alias / interface
  // (which the static expander can't resolve) is SKIPPED and falls back to
  // property → column → unknown.
  it('expands non-exported enums and skips non-expandable non-exported types', async () => {
    const routes = await discoverContractsFast({
      cwd: FIXTURES,
      glob: 'filter-for-param-unexported.controller.ts',
    });
    outDir = await mkdtemp(join(tmpdir(), 'filter-for-param-unexp-emit-'));
    await emitApi(routes, outDir);
    const content = await readFile(join(outDir, 'api.ts'), 'utf8');

    // No import is emitted for any of the non-exported internal types.
    expect(content).not.toMatch(/import[^\n]*\bInternalState\b/);
    expect(content).not.toMatch(/import[^\n]*\bInternalMode\b/);
    expect(content).not.toMatch(/import[^\n]*\bInternalLevel\b/);
    expect(content).not.toMatch(/import[^\n]*\bInternalShape\b/);

    // Non-exported string enum → expanded to its value union (no import).
    // Non-exported numeric enum → expanded to its numeric VALUES 1 | 2 (not the
    // member names). Non-exported alias union (mode) + interface (shape) →
    // skipped (absent). Primitive (name) intact.
    expect(content).toContain(
      'filterQuery: () => _filterQueryTyped<"state" | "level" | "name", ' +
        '{ "state": "open" | "closed"; "level": 1 | 2; "name": string }>(),',
    );
  });
});

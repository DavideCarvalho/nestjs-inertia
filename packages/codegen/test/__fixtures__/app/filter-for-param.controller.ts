import { Controller, Get } from '@nestjs/common';

// ── Simulated nestjs-filter decorators (same shape as the real ones) ────────
function Filterable(_opts?: unknown): ClassDecorator {
  return () => {};
}
function FilterFor(_inputKey?: string, _opts?: { type?: unknown }): MethodDecorator {
  return () => {};
}
function ApplyFilter(_filterClass: new (...args: unknown[]) => unknown): ParameterDecorator {
  return () => {};
}

// Local named enum — must be emitted as `import type { Status }` (option B).
export enum Status {
  Active = 'active',
  Archived = 'archived',
}

// ── Filter whose virtual fields infer their type from the @FilterFor METHOD
//    PARAMETER TYPE (the new primary mechanism). ──────────────────────────────
@Filterable()
export class ParamFilter {
  // (a) primitive number param, NO { type } hint → inferred `number`.
  @FilterFor('minAge')
  applyMinAge(_v: number) {}

  // (b) named local enum param → typeRef → `import type { Status }` + `Status`.
  @FilterFor('state')
  applyState(_v: Status) {}

  // (c) literal union param → emit the union text directly (no import).
  @FilterFor('mode')
  applyMode(_v: 'draft' | 'published') {}

  // (d) explicit { type } hint OVERRIDES the param type (param is string, hint
  //     says number → number must win).
  @FilterFor('score', { type: 'number' })
  applyScore(_v: string) {}

  // (e) unresolvable `any` param → skipped (no field emitted).
  @FilterFor('blob')
  applyBlob(_v: any) {}
}

@Controller('/api/params')
export class FilterForParamController {
  @Get()
  list(@ApplyFilter(ParamFilter) _qb: unknown) {
    return [];
  }
}

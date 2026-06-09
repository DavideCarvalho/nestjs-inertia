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

// NON-exported enum: cannot be `import type`-ed → must EXPAND to a literal union.
enum InternalState {
  Open = 'open',
  Closed = 'closed',
}

// NON-exported type alias union → expands to its literal union.
type InternalMode = 'draft' | 'live';

// NON-exported NUMERIC enum → must expand to its numeric VALUES (1 | 2), not the
// member names ("Low" | "High"). Regression guard for findType enum extraction.
enum InternalLevel {
  Low = 1,
  High = 2,
}

// NON-exported interface: not statically expandable → field must be SKIPPED
// (falls back to property → column → unknown).
interface InternalShape {
  foo: string;
}

@Filterable()
export class UnexportedParamFilter {
  // (a) non-exported string enum param → expand to "open" | "closed", NO import.
  @FilterFor('state')
  applyState(_v: InternalState) {}

  // (b) non-exported type-alias union param → expand to "draft" | "live", NO import.
  @FilterFor('mode')
  applyMode(_v: InternalMode) {}

  // (b2) non-exported numeric enum param → expand to 1 | 2 (values, not names).
  @FilterFor('level')
  applyLevel(_v: InternalLevel) {}

  // (c) non-exported interface param → not expandable → skipped.
  @FilterFor('shape')
  applyShape(_v: InternalShape) {}

  // (d) sanity: a plain primitive still works alongside the above.
  @FilterFor('name')
  applyName(_v: string) {}
}

@Controller('/api/unexported-params')
export class FilterForParamUnexportedController {
  @Get()
  list(@ApplyFilter(UnexportedParamFilter) _qb: unknown) {
    return [];
  }
}

import { Controller, Get } from '@nestjs/common';

// ── Simulated nestjs-filter decorators (same shape as the real ones) ────────
function Property(_opts?: unknown): PropertyDecorator {
  return () => {};
}
function Filterable(_opts?: unknown): ClassDecorator {
  return () => {};
}
function FilterFor(_inputKey?: string, _opts?: { type?: unknown }): MethodDecorator {
  return () => {};
}
function ApplyFilter(_filterClass: new (...args: unknown[]) => unknown): ParameterDecorator {
  return () => {};
}

// ── Filter class mixing a real property column with virtual @FilterFor keys ──
@Filterable()
export class WidgetFilter {
  // Real class property — classified from its TS type (string).
  name!: string;

  // Virtual numeric field — no matching column / property. The { type } hint
  // upgrades it from unknown → number.
  @FilterFor('minAge', { type: 'number' })
  applyMinAge(_v: number) {}

  // Virtual enum field — string-literal array → "active" | "archived".
  @FilterFor('state', { type: ['active', 'archived'] })
  applyState(_v: string) {}

  // Virtual field WITHOUT a hint — must remain permissive (unknown).
  @FilterFor('legacy')
  applyLegacy(_v: unknown) {}
}

// ── Precedence: a @FilterFor hint on a key that ALSO has a class property ───
@Filterable()
export class OverrideFilter {
  // Declared as a string property...
  score?: string;

  // ...but @FilterFor('score', { type: 'number' }) must WIN → number.
  @FilterFor('score', { type: 'number' })
  applyScore(_v: number) {}
}

@Controller('/api/widgets')
export class FilterForHintController {
  @Get()
  list(@ApplyFilter(WidgetFilter) _qb: unknown) {
    return [];
  }

  @Get('override')
  overrides(@ApplyFilter(OverrideFilter) _qb: unknown) {
    return [];
  }
}

import { Controller, Get } from '@nestjs/common';
import type { Role, Tier } from './dto/role.enum.js';

function Filterable(_opts?: unknown): ClassDecorator {
  return () => {};
}
function FilterFor(_inputKey?: string, _opts?: { type?: unknown }): MethodDecorator {
  return () => {};
}
function ApplyFilter(_filterClass: new (...args: unknown[]) => unknown): ParameterDecorator {
  return () => {};
}

// Filter whose @FilterFor params reference enums/aliases declared in ANOTHER
// file → the codegen must emit relative `import type` statements to that file.
@Filterable()
export class ImportedFilter {
  @FilterFor('role')
  applyRole(_v: Role) {}

  @FilterFor('tier')
  applyTier(_v: Tier) {}
}

@Controller('/api/imported')
export class FilterForParamImportedController {
  @Get()
  list(@ApplyFilter(ImportedFilter) _qb: unknown) {
    return [];
  }
}

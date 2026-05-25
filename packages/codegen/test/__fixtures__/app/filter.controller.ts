import { Controller, Get } from '@nestjs/common';

// Simulated filter class (same shape as nestjs-filter)
export class UserFilter {
  name?: string;
  minAge?: number;
  status?: string;
}

// Simulated ApplyFilter decorator (parameter decorator)
function ApplyFilter(_filterClass: new (...args: unknown[]) => unknown): ParameterDecorator {
  return () => {};
}

@Controller('/api/users')
export class FilterController {
  @Get()
  list(@ApplyFilter(UserFilter) _qb: unknown) {
    return [];
  }
}

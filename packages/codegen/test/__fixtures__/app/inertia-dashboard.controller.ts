import { Controller, Get } from '@nestjs/common';

// Decorator stub — not the real @Inertia from the package, just simulating the pattern
function Inertia(_component: string) {
  return (_target: unknown, _key: string, _descriptor: PropertyDescriptor) => _descriptor;
}

@Controller()
export class DashboardController {
  @Get('/dashboard')
  @Inertia('Dashboard')
  index() {
    return {};
  }
}

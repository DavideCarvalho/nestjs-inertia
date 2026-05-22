import { Controller, Get } from '@nestjs/common';
import { Inertia } from '@dudousxd/nestjs-inertia';

@Controller()
export class DashboardController {
  @Get('/')
  @Get('/dashboard')
  @Inertia('Dashboard')
  index(): { user: { id: number; name: string }; count: number } {
    return { user: { id: 1, name: 'Davi' }, count: 42 };
  }
}

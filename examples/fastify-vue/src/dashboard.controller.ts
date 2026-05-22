import { Inertia } from '@dudousxd/nestjs-inertia';
import { Controller, Get } from '@nestjs/common';

@Controller()
export class DashboardController {
  @Get('/dashboard')
  @Inertia('Dashboard')
  index(): { user: { name: string }; posts: number } {
    return { user: { name: 'Davi' }, posts: 3 };
  }
}

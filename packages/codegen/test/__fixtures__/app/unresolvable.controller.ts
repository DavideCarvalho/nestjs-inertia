import { Controller, Get } from '@nestjs/common';

@Controller('/api/mystery')
export class UnresolvableController {
  @Get()
  getData(): SomeNonExistentType {
    return {} as any;
  }
}

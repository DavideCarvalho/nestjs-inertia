import { Controller, Get } from '@nestjs/common';

// No @Inertia usage anywhere under this glob — pageExcludes should throw when scanning here.
@Controller('plain')
export class PlainController {
  @Get()
  index() {
    return { ok: true };
  }
}

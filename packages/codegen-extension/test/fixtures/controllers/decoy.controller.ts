import { Controller, Get } from '@nestjs/common';
// A same-named decorator from an unrelated module — must NOT be treated as an Inertia page.
import { Inertia } from 'some-other-library';

@Controller('decoy')
export class DecoyController {
  @Get()
  @Inertia('NotARealPage')
  index() {
    return {};
  }
}

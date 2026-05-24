import { Controller, Get } from '@nestjs/common';

class StreamableFile {}

@Controller('/api/stream')
export class StreamController {
  @Get()
  download(): StreamableFile {
    return {} as any;
  }
}

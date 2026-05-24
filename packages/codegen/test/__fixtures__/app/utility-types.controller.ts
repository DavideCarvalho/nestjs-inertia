import { Body, Controller, Get, Post } from '@nestjs/common';

interface TriggerBody {
  name: string;
  payload?: Record<string, unknown>;
}

@Controller('/api/triggers')
export class UtilityTypesController {
  @Post()
  trigger(@Body() body: TriggerBody): Promise<Record<string, unknown>> {
    return {} as any;
  }
}

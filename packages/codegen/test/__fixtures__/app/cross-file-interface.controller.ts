import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  FleetResponse,
  type TelemetryBody,
  type VesselStatus,
  type VesselType,
} from './dto/fleet.dto';

@Controller('/api/fleet')
export class CrossFileInterfaceController {
  @Get()
  @ApiResponse({ type: FleetResponse })
  list(): Promise<FleetResponse> {
    return {} as any;
  }

  @Post('/telemetry')
  create(@Body() body: TelemetryBody): Promise<void> {
    return {} as any;
  }

  @Get('/status')
  status(): VesselStatus {
    return 'active' as any;
  }

  @Get('/types')
  types(): VesselType {
    return 'cargo' as any;
  }
}

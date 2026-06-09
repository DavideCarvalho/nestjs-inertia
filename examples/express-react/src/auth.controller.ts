import { Inertia } from '@dudousxd/nestjs-inertia';
import { defineContract } from '@dudousxd/nestjs-inertia-client';
import { ApplyContract } from '@dudousxd/nestjs-inertia-client/server';
import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';

// Exported named const → codegen re-exports `loginContract.body` as
// `LoginBodySchema` in forms.ts (perfect client/server parity, Path A).
export const loginContract = defineContract({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
  }),
  response: z.object({ ok: z.boolean() }),
});

@Controller('auth')
export class AuthController {
  @Get('/login')
  @Inertia('Login')
  showLogin(): Record<string, never> {
    return {};
  }

  @Post('/login')
  @ApplyContract(loginContract, { validate: true })
  login(@Body() _body: { email: string; password: string }, @Res() res: Response): void {
    // Valid credentials → redirect to the dashboard. Invalid bodies never reach
    // here: ContractValidationPipe throws, InertiaValidationFilter flashes the
    // error bag and 303-redirects back to /auth/login.
    res.status(303).setHeader('Location', '/dashboard').end();
  }
}

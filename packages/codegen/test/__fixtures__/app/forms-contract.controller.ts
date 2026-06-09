import 'reflect-metadata';
import { defineContract } from '@dudousxd/nestjs-inertia-client';
import { ApplyContract } from '@dudousxd/nestjs-inertia-client/server';
import { Controller, Post } from '@nestjs/common';
import { z } from 'zod';

// Exported named const → re-exported via bodyZodRef (Path A).
export const loginContract = defineContract({
  body: z.object({ email: z.string().email(), password: z.string().min(8) }),
  response: z.object({ ok: z.boolean() }),
});

@Controller('auth')
export class AuthFormsController {
  @Post('/login')
  @ApplyContract(loginContract)
  login() {
    return { ok: true };
  }

  // Inline defineContract → captured via bodyZodText (Path A inline).
  @Post('/signup')
  @ApplyContract(
    defineContract({
      body: z.object({ name: z.string().min(1) }),
      response: z.object({ id: z.string() }),
    }),
  )
  signup() {
    return { id: '1' };
  }
}

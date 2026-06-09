import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { extractFieldErrors } from '../../src/validation/extract-field-errors.js';

describe('extractFieldErrors', () => {
  it('returns the dedicated factory payload as-is (nested items.0.qty)', () => {
    const ex = new BadRequestException({
      __inertiaErrors: { email: 'bad', 'items.0.qty': 'positive' },
    });
    expect(extractFieldErrors(ex)).toEqual({ email: 'bad', 'items.0.qty': 'positive' });
  });

  it('maps ContractValidationPipe issues (path joined with dots)', () => {
    const ex = new BadRequestException({
      message: 'Contract validation failed',
      issues: [
        { path: ['email'], message: 'Invalid email' },
        { path: ['items', 0, 'qty'], message: 'Too small' },
      ],
    });
    expect(extractFieldErrors(ex)).toEqual({
      email: 'Invalid email',
      'items.0.qty': 'Too small',
    });
  });

  it('maps a raw ZodError thrown directly', () => {
    const zodError = {
      name: 'ZodError',
      issues: [{ path: ['password'], message: 'Required' }],
    };
    expect(extractFieldErrors(zodError)).toEqual({ password: 'Required' });
  });

  it('parses flat class-validator message: string[] (leading token = key)', () => {
    const ex = new BadRequestException({
      statusCode: 400,
      message: ['email must be an email', 'password must be longer'],
      error: 'Bad Request',
    });
    expect(extractFieldErrors(ex)).toEqual({
      email: 'email must be an email',
      password: 'password must be longer',
    });
  });

  it('merges duplicate keys first-wins by default', () => {
    const ex = new BadRequestException({
      message: 'Contract validation failed',
      issues: [
        { path: ['email'], message: 'first' },
        { path: ['email'], message: 'second' },
      ],
    });
    expect(extractFieldErrors(ex)).toEqual({ email: 'first' });
  });

  it("joins duplicate keys when mergeMessages: 'join'", () => {
    const ex = new BadRequestException({
      message: 'Contract validation failed',
      issues: [
        { path: ['email'], message: 'first' },
        { path: ['email'], message: 'second' },
      ],
    });
    expect(extractFieldErrors(ex, { mergeMessages: 'join' })).toEqual({
      email: 'first second',
    });
  });

  it('returns null for a non-validation BadRequestException', () => {
    const ex = new BadRequestException('Something else entirely');
    expect(extractFieldErrors(ex)).toBeNull();
  });

  it('returns null for an arbitrary error', () => {
    expect(extractFieldErrors(new Error('nope'))).toBeNull();
  });
});

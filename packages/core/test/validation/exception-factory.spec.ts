import { BadRequestException, type ValidationError } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  flattenValidationErrors,
  inertiaValidationExceptionFactory,
} from '../../src/validation/exception-factory.js';

function ve(
  property: string,
  constraints?: Record<string, string>,
  children?: ValidationError[],
): ValidationError {
  return { property, constraints, children } as ValidationError;
}

describe('flattenValidationErrors', () => {
  it('maps flat constraints to first message', () => {
    const errors = [
      ve('email', { isEmail: 'email must be an email' }),
      ve('password', { minLength: 'password too short', isString: 'must be string' }),
    ];
    expect(flattenValidationErrors(errors)).toEqual({
      email: 'email must be an email',
      password: 'password too short',
    });
  });

  it('flattens nested children into dot/numeric-index paths (items.0.qty)', () => {
    const errors = [
      ve('items', undefined, [
        ve('0', undefined, [ve('qty', { min: 'qty must be positive' })]),
        ve('1', undefined, [ve('name', { isNotEmpty: 'name is required' })]),
      ]),
    ];
    expect(flattenValidationErrors(errors)).toEqual({
      'items.0.qty': 'qty must be positive',
      'items.1.name': 'name is required',
    });
  });

  it('flattens single nested object (address.city)', () => {
    const errors = [ve('address', undefined, [ve('city', { isNotEmpty: 'city is required' })])];
    expect(flattenValidationErrors(errors)).toEqual({
      'address.city': 'city is required',
    });
  });

  it('omits nodes with no constraints and no children', () => {
    expect(flattenValidationErrors([ve('foo')])).toEqual({});
  });
});

describe('inertiaValidationExceptionFactory', () => {
  it('returns a BadRequestException carrying __inertiaErrors', () => {
    const ex = inertiaValidationExceptionFactory([
      ve('email', { isEmail: 'email must be an email' }),
    ]);
    expect(ex).toBeInstanceOf(BadRequestException);
    expect(ex.getResponse()).toEqual({ __inertiaErrors: { email: 'email must be an email' } });
  });
});

import { describe, expect, it } from 'vitest';
import {
  InertiaServiceNotAvailableException,
  InvalidCsrfTokenException,
  InvalidInertiaConfigException,
  MissingCookieDepException,
  MissingTemplateEngineDepException,
  UnsupportedRootViewExtensionException,
} from '../src/errors/exceptions.js';

describe('InvalidInertiaConfigException', () => {
  it('has the correct name and message', () => {
    const err = new InvalidInertiaConfigException('bad value');
    expect(err.name).toBe('InvalidInertiaConfigException');
    expect(err.message).toContain('Invalid config');
    expect(err.message).toContain('bad value');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('InertiaServiceNotAvailableException', () => {
  it('has the correct name and message', () => {
    const err = new InertiaServiceNotAvailableException();
    expect(err.name).toBe('InertiaServiceNotAvailableException');
    expect(err.message).toContain('req.inertia is not defined');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('UnsupportedRootViewExtensionException', () => {
  it('includes the extension in the message', () => {
    const err = new UnsupportedRootViewExtensionException('.xyz');
    expect(err.name).toBe('UnsupportedRootViewExtensionException');
    expect(err.message).toContain('.xyz');
    expect(err.message).toContain('not supported');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('MissingTemplateEngineDepException', () => {
  it('includes engine and package name in the message', () => {
    const err = new MissingTemplateEngineDepException('handlebars', 'handlebars');
    expect(err.name).toBe('MissingTemplateEngineDepException');
    expect(err.message).toContain('handlebars');
    expect(err.message).toContain('peer dependency');
    expect(err.message).toContain('pnpm add handlebars');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('MissingCookieDepException', () => {
  it('recommends cookie-parser for express', () => {
    const err = new MissingCookieDepException('express');
    expect(err.name).toBe('MissingCookieDepException');
    expect(err.message).toContain('cookie-parser');
    expect(err.message).toContain('express');
    expect(err).toBeInstanceOf(Error);
  });

  it('recommends @fastify/cookie for fastify', () => {
    const err = new MissingCookieDepException('fastify');
    expect(err.name).toBe('MissingCookieDepException');
    expect(err.message).toContain('@fastify/cookie');
    expect(err.message).toContain('fastify');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('InvalidCsrfTokenException', () => {
  it('is a ForbiddenException with correct message', () => {
    const err = new InvalidCsrfTokenException();
    expect(err.message).toContain('CSRF token');
    // ForbiddenException has status 403
    expect(err.getStatus()).toBe(403);
  });
});

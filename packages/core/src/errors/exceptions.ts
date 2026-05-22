export class InvalidInertiaConfigException extends Error {
  constructor(message: string) {
    super(`[nestjs-inertia] Invalid config: ${message}`);
    this.name = 'InvalidInertiaConfigException';
  }
}

export class InertiaServiceNotAvailableException extends Error {
  constructor() {
    super('[nestjs-inertia] req.inertia is not defined — middleware did not run. Ensure InertiaModule is imported and the middleware applies to this route.');
    this.name = 'InertiaServiceNotAvailableException';
  }
}

export class UnsupportedRootViewExtensionException extends Error {
  constructor(extension: string) {
    super(`[nestjs-inertia] rootView extension "${extension}" is not supported. Supported extensions: .html, .htm, .hbs, .handlebars, .ejs, .pug, .liquid, .liquidjs. Or pass a (ctx) => string function for full control.`);
    this.name = 'UnsupportedRootViewExtensionException';
  }
}

export class MissingTemplateEngineDepException extends Error {
  constructor(engine: string, packageName: string) {
    super(`[nestjs-inertia] Template engine "${engine}" requires "${packageName}" as a peer dependency. Install with: pnpm add ${packageName}`);
    this.name = 'MissingTemplateEngineDepException';
  }
}

export class MissingCookieDepException extends Error {
  constructor(platform: 'express' | 'fastify') {
    const dep = platform === 'express' ? 'cookie-parser' : '@fastify/cookie';
    super(`[nestjs-inertia] CSRF requires "${dep}" as a peer dependency for ${platform}. Install with: pnpm add ${dep}`);
    this.name = 'MissingCookieDepException';
  }
}

import { ForbiddenException } from '@nestjs/common';

export class InvalidCsrfTokenException extends ForbiddenException {
  constructor() {
    super('[nestjs-inertia] CSRF token is missing or invalid.');
  }
}

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
    super(`[nestjs-inertia] rootView extension "${extension}" is not supported in core. Template engines (.hbs/.ejs/.pug/.liquid) are planned for Plan A.3. Use a .html file with built-in directives or pass a (ctx) => string function.`);
    this.name = 'UnsupportedRootViewExtensionException';
  }
}

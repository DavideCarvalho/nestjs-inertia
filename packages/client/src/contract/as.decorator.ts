import { SetMetadata } from '@nestjs/common';

export const ROUTE_NAME_METADATA = Symbol.for('nestjs-inertia:route-name');

/**
 * Override the auto-derived route name on a controller method.
 *
 * Codegen derives the name as `<controller>.<method>` by default (stripping
 * the `Controller` suffix and lowercasing the first letter). Use `@As` when
 * the natural derivation isn't what you want.
 *
 * @example
 * ```ts
 * @Controller('/api/v1/crew')
 * class CrewController {
 *   @Get()
 *   @ApplyContract(ListCrew)
 *   @As('crew.directory.fetch')   // overrides default 'crew.list'
 *   list() { ... }
 * }
 * ```
 */
export const As = (name: string): MethodDecorator => SetMetadata(ROUTE_NAME_METADATA, name);

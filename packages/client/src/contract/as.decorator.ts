import { SetMetadata } from '@nestjs/common';

export const ROUTE_NAME_METADATA = Symbol.for('nestjs-inertia:route-name');

/**
 * Override the auto-derived route name on a controller class or method.
 *
 * Codegen composes the final name as `${classPortion}.${methodPortion}`:
 * - **Class portion**: class-level `@As(...)` value if present, else the class name
 *   with the `Controller` suffix stripped and first letter lowercased.
 * - **Method portion**: method-level `@As(...)` value if present, else the method name.
 *
 * Both can be multi-segment (contain dots). Each segment is validated against
 * `/^[a-z][a-zA-Z0-9]*$/`.
 *
 * @example Class-level override
 * ```ts
 * @Controller('/api/v1/crew')
 * @As('crew')
 * class CrewController {
 *   @Get()
 *   @ApplyContract(ListCrew)
 *   list() { ... }   // → 'crew.list'
 * }
 * ```
 *
 * @example Method-level override only
 * ```ts
 * @Controller('/api/v1/crew')
 * class CrewController {
 *   @Get()
 *   @ApplyContract(ListCrew)
 *   @As('directory.fetch')   // → 'crew.directory.fetch'
 *   list() { ... }
 * }
 * ```
 *
 * @example Both class and method
 * ```ts
 * @Controller('/api/v1/crew')
 * @As('crew.admin')
 * class CrewController {
 *   @Get()
 *   @ApplyContract(ListCrew)
 *   @As('top10')   // → 'crew.admin.top10'
 *   list() { ... }
 * }
 * ```
 */
export const As = (name: string): ClassDecorator & MethodDecorator =>
  SetMetadata(ROUTE_NAME_METADATA, name);

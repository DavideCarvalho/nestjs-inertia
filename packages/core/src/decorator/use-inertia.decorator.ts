import { SetMetadata } from '@nestjs/common';

export const INERTIA_USE_SCOPE = 'INERTIA_USE_SCOPE';

export function UseInertia(scope: string): ClassDecorator & MethodDecorator {
  return SetMetadata(INERTIA_USE_SCOPE, scope);
}

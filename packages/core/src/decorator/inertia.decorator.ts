import { SetMetadata } from '@nestjs/common';

export const INERTIA_RENDER_COMPONENT = Symbol('INERTIA_RENDER_COMPONENT');

export function createInertiaDecorator(component: string): MethodDecorator {
  return SetMetadata(INERTIA_RENDER_COMPONENT, component);
}

export interface InertiaRegistry {
  pages?: string;
}

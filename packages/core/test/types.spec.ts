import { describe, it, expectTypeOf } from 'vitest';
import type {
  PageObject,
  SsrResult,
  SharedFactory,
  SharedInput,
  Props,
  InertiaModuleOptions,
  InertiaFeatureOptions,
} from '../src/types.js';

describe('types', () => {
  it('PageObject has correct shape', () => {
    expectTypeOf<PageObject>().toMatchTypeOf<{
      component: string;
      props: Record<string, unknown>;
      url: string;
      version: string;
    }>();
  });

  it('SsrResult has head[] and body', () => {
    expectTypeOf<SsrResult>().toMatchTypeOf<{ head: string[]; body: string }>();
  });

  it('SharedInput is object or factory', () => {
    expectTypeOf<SharedInput>().toEqualTypeOf<Record<string, unknown> | SharedFactory>();
  });

  it('InertiaModuleOptions has rootView and share', () => {
    expectTypeOf<InertiaModuleOptions['rootView']>().toMatchTypeOf<string | ((ctx: unknown) => string | Promise<string>) | undefined>();
  });

  it('Props is a Record<string, unknown>', () => {
    expectTypeOf<Props>().toEqualTypeOf<Record<string, unknown>>();
  });

  it('InertiaFeatureOptions has scope field', () => {
    expectTypeOf<InertiaFeatureOptions['scope']>().toEqualTypeOf<string>();
  });
});

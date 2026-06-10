import { describe, expect, it } from 'vitest';
import { nestjsInertiaCodegen } from '../src/index.js';

describe('nestjsInertiaCodegen', () => {
  it('is a named extension exposing apiHeader', () => {
    const ext = nestjsInertiaCodegen();
    expect(ext.name).toBe('nestjs-inertia');
    expect(typeof ext.apiHeader).toBe('function');
  });

  it('apiHeader imports the Inertia router + emits NavigateOptions and navigate()', () => {
    const header = nestjsInertiaCodegen().apiHeader?.({} as never);
    expect(header?.imports).toEqual(["import { router } from '@inertiajs/react';"]);
    expect(header?.statements?.[0]).toContain('export type NavigateOptions');
    expect(header?.statements?.[1]).toContain('export function navigate<K extends RouteName>');
    expect(header?.statements?.[1]).toContain('router.visit(url, visitOptions)');
  });
});

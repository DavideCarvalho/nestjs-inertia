import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { InertiaRenderDiagnostic } from '../src/diagnostics.js';

/**
 * Cross-repo producer-side contract for the `nestjs-inertia:render` diagnostics
 * channel. `inertia-render.v1.json` is committed byte-identically in BOTH this
 * repo and nestjs-telescope (the consumer's InertiaWatcher). It MUST stay
 * byte-identical across both — do not edit one without the other. These tests
 * are the tripwire: a producer-side field rename/removal on
 * `InertiaRenderDiagnostic` fails the build here.
 */

const fixturePath = fileURLToPath(new URL('./fixtures/inertia-render.v1.json', import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

// Type-level assertion: the fixture's shape must satisfy the producer interface.
// `satisfies` here fails to compile if the interface drops/renames a field the
// fixture carries, or changes a field's type incompatibly.
const _typeCheck = {
  v: 1,
  component: 'Dashboard',
  url: '/dashboard',
  method: 'GET',
  isInertia: true,
  isPartial: false,
  partial: { only: [], except: [], reset: [], resetOnce: [] },
  props: {
    sharedKeys: ['auth'],
    finalKeys: ['auth', 'stats'],
    deferred: { default: ['stats'] },
    merge: [],
    deepMerge: [],
    matchPropsOn: {},
    optionalKeys: [],
    onceKeys: [],
    excludedKeys: [],
  },
  resolvedProps: { auth: { user: 'x' }, stats: null },
  assetVersion: 'abc123',
  versionMismatch: false,
  clientVersion: null,
  encryptHistory: false,
  clearHistory: false,
  statusCode: 200,
  pageBytes: 161,
  ssr: false,
} satisfies InertiaRenderDiagnostic;

describe('producer-side render diagnostic contract', () => {
  it('the static type-level fixture matches the JSON fixture exactly', () => {
    // Guards that the inline `satisfies`-checked object stays in sync with the
    // committed cross-repo JSON file.
    expect(_typeCheck).toEqual(fixture);
  });

  it('every key in the fixture exists on InertiaRenderDiagnostic', () => {
    // The canonical key list of the interface. Keeping it here (rather than
    // reflecting — interfaces have no runtime presence) means a producer field
    // rename/removal forces an edit to BOTH the interface and this list, so a
    // silent drift can't slip through.
    const diagnosticKeys: ReadonlyArray<keyof InertiaRenderDiagnostic> = [
      'v',
      'component',
      'url',
      'method',
      'isInertia',
      'isPartial',
      'partial',
      'props',
      'resolvedProps',
      'assetVersion',
      'versionMismatch',
      'clientVersion',
      'encryptHistory',
      'clearHistory',
      'statusCode',
      'pageBytes',
      'ssr',
    ];
    for (const key of Object.keys(fixture)) {
      expect(diagnosticKeys).toContain(key);
    }
  });

  it('the props sub-object carries every documented marker-classification key', () => {
    const propsKeys: ReadonlyArray<keyof InertiaRenderDiagnostic['props']> = [
      'sharedKeys',
      'finalKeys',
      'deferred',
      'merge',
      'deepMerge',
      'matchPropsOn',
      'optionalKeys',
      'onceKeys',
      'excludedKeys',
    ];
    for (const key of Object.keys(fixture.props)) {
      expect(propsKeys).toContain(key);
    }
  });
});

/**
 * Tests for shared props discovery from `InertiaModule.forRoot({ share: ... })`.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { discoverSharedProps } from '../../src/discovery/shared-props.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '../__fixtures__/shared-props');

function createProject(): Project {
  return new Project({
    skipAddingFilesFromTsConfig: true,
    skipLoadingLibFiles: true,
    skipFileDependencyResolution: true,
    compilerOptions: { strict: false },
  });
}

describe('discoverSharedProps', () => {
  describe('inline arrow function share', () => {
    it('discovers properties from inline arrow function with ternary', () => {
      const project = createProject();
      const result = discoverSharedProps(project, resolve(fixturesDir, 'inline-arrow.module.ts'));

      expect(result).not.toBeNull();
      expect(result!.properties).not.toBeNull();
      expect(result!.properties!.length).toBe(2);

      const auth = result!.properties!.find((p) => p.name === 'auth');
      expect(auth).toBeDefined();
      // ternary: req.user ? { id: ..., name: ... } : null → object | null
      expect(auth!.type).toContain('null');
      expect(auth!.type).toContain('id');

      const flash = result!.properties!.find((p) => p.name === 'flash');
      expect(flash).toBeDefined();
      // empty object literal → Record<string, unknown>
      expect(flash!.type).toBe('Record<string, unknown>');
    });

    it('includes auth and flash in typeString', () => {
      const project = createProject();
      const result = discoverSharedProps(project, resolve(fixturesDir, 'inline-arrow.module.ts'));

      expect(result).not.toBeNull();
      expect(result!.typeString).toContain('auth');
      expect(result!.typeString).toContain('flash');
    });
  });

  describe('return type annotation on share function', () => {
    it('uses the annotated return type', () => {
      const project = createProject();
      const result = discoverSharedProps(
        project,
        resolve(fixturesDir, 'return-type-annotation.module.ts'),
      );

      expect(result).not.toBeNull();
      expect(result!.properties).not.toBeNull();
      expect(result!.properties!.length).toBe(2);

      const auth = result!.properties!.find((p) => p.name === 'auth');
      expect(auth).toBeDefined();
      expect(auth!.type).toBe('{ id: string; name: string } | null');

      const flash = result!.properties!.find((p) => p.name === 'flash');
      expect(flash).toBeDefined();
      expect(flash!.type).toBe('Record<string, string>');
    });
  });

  describe('forRoot without share property', () => {
    it('returns null when no share property is present', () => {
      const project = createProject();
      const result = discoverSharedProps(project, resolve(fixturesDir, 'no-share.module.ts'));

      expect(result).toBeNull();
    });
  });

  describe('async share function', () => {
    it('discovers properties from async arrow function', () => {
      const project = createProject();
      const result = discoverSharedProps(project, resolve(fixturesDir, 'async-share.module.ts'));

      expect(result).not.toBeNull();
      expect(result!.properties).not.toBeNull();
      expect(result!.properties!.length).toBe(3);

      const auth = result!.properties!.find((p) => p.name === 'auth');
      expect(auth).toBeDefined();

      const notifications = result!.properties!.find((p) => p.name === 'notifications');
      expect(notifications).toBeDefined();
      expect(notifications!.type).toBe('Array<unknown>');

      const flash = result!.properties!.find((p) => p.name === 'flash');
      expect(flash).toBeDefined();
    });
  });

  describe('block body arrow function', () => {
    it('discovers properties from block body return statement', () => {
      const project = createProject();
      const result = discoverSharedProps(project, resolve(fixturesDir, 'block-body.module.ts'));

      expect(result).not.toBeNull();
      expect(result!.properties).not.toBeNull();
      expect(result!.properties!.length).toBe(3);

      const auth = result!.properties!.find((p) => p.name === 'auth');
      expect(auth).toBeDefined();

      const locale = result!.properties!.find((p) => p.name === 'locale');
      expect(locale).toBeDefined();
      expect(locale!.type).toBe('string');

      const flash = result!.properties!.find((p) => p.name === 'flash');
      expect(flash).toBeDefined();
    });
  });

  describe('object literal share', () => {
    it('discovers properties from plain object literal', () => {
      const project = createProject();
      const result = discoverSharedProps(
        project,
        resolve(fixturesDir, 'object-literal-share.module.ts'),
      );

      expect(result).not.toBeNull();
      expect(result!.properties).not.toBeNull();
      expect(result!.properties!.length).toBe(2);

      const appName = result!.properties!.find((p) => p.name === 'appName');
      expect(appName).toBeDefined();
      expect(appName!.type).toBe('string');

      const version = result!.properties!.find((p) => p.name === 'version');
      expect(version).toBeDefined();
      expect(version!.type).toBe('string');
    });
  });

  describe('async function with Promise return type annotation', () => {
    it('unwraps Promise<T> and extracts properties from the inner type', () => {
      const project = createProject();
      const result = discoverSharedProps(
        project,
        resolve(fixturesDir, 'async-return-type.module.ts'),
      );

      expect(result).not.toBeNull();
      expect(result!.properties).not.toBeNull();
      expect(result!.properties!.length).toBe(2);

      const auth = result!.properties!.find((p) => p.name === 'auth');
      expect(auth).toBeDefined();
      expect(auth!.type).toBe('{ id: string } | null');

      const csrfToken = result!.properties!.find((p) => p.name === 'csrfToken');
      expect(csrfToken).toBeDefined();
      expect(csrfToken!.type).toBe('string');
    });
  });

  describe('no InertiaModule.forRoot call', () => {
    it('returns null when there is no InertiaModule.forRoot call', () => {
      const project = createProject();
      const result = discoverSharedProps(
        project,
        resolve(fixturesDir, 'no-inertia-module.module.ts'),
      );

      expect(result).toBeNull();
    });
  });

  describe('nonexistent file', () => {
    it('returns null when the module entry file does not exist', () => {
      const project = createProject();
      const result = discoverSharedProps(project, resolve(fixturesDir, 'nonexistent.module.ts'));

      expect(result).toBeNull();
    });
  });

  describe('isImportRef flag', () => {
    it('inline arrow function sets isImportRef to false', () => {
      const project = createProject();
      const result = discoverSharedProps(project, resolve(fixturesDir, 'inline-arrow.module.ts'));

      expect(result).not.toBeNull();
      expect(result!.isImportRef).toBe(false);
    });

    it('return type annotation sets isImportRef to false', () => {
      const project = createProject();
      const result = discoverSharedProps(
        project,
        resolve(fixturesDir, 'return-type-annotation.module.ts'),
      );

      expect(result).not.toBeNull();
      expect(result!.isImportRef).toBe(false);
    });
  });
});

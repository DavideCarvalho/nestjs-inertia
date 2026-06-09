import type { Project, SourceFile } from 'ts-morph';
import { findType } from './type-ref-resolution.js';

/**
 * Resolve an enum identifier to its raw member values + numeric flag.
 *
 * KNOWN LIMITATION — mixed enums with a computed member: `findType` serializes
 * each enum member with `JSON.stringify` of its static value, falling back to the
 * QUOTED member NAME for any member whose value can't be resolved statically
 * (e.g. a computed member). Here we re-derive `numeric` by `JSON.parse`-ing each
 * member: any string member (including that quoted-name fallback) flips `numeric`
 * to `false` for the WHOLE enum. So a primarily-numeric enum that contains a
 * single computed member is treated as a string enum, and its numeric members
 * are emitted as quoted string literals. This is a rare edge case; fixing it
 * would require threading per-member numeric-ness out of `findType` rather than
 * inferring it from the stringified members. Pure numeric and pure string enums
 * (the overwhelmingly common cases) are unaffected.
 */
export function resolveEnumValues(
  name: string,
  sourceFile: SourceFile,
  project: Project,
): { values: string[]; numeric: boolean } | null {
  const resolved = findType(name, sourceFile, project);
  if (!resolved || resolved.kind !== 'enum') return null;
  // members are JSON.stringify'd ("A" / "0"); strip quotes to raw values.
  let numeric = true;
  const values = resolved.members.map((m) => {
    const parsed = JSON.parse(m) as string | number;
    if (typeof parsed === 'string') numeric = false;
    return String(parsed);
  });
  if (values.length === 0) return null;
  return { values, numeric };
}

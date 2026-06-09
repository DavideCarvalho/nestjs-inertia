import type { Project, SourceFile } from 'ts-morph';
import { findType } from './type-ref-resolution.js';

/** Resolve an enum identifier to its raw member values + numeric flag. */
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

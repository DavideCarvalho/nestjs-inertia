export interface TypeRef {
  name: string;
  filePath: string;
  isArray?: boolean;
}

export type FieldTypeKind = 'string' | 'number' | 'boolean' | 'date' | 'json' | 'unknown';

/**
 * A classified filter field.
 *
 * INVARIANT — `typeRef` precedence: when `typeRef` is set it is the SOLE source
 * of truth for the emitted type; `kind`/`enumValues`/`numericEnum` are then only
 * a best-effort fallback recorded for non-emit consumers (tests/introspection),
 * NOT something the emitter reads. A discriminated union would make "carries both
 * a ref AND a literal kind" unrepresentable, but the producers and tests read
 * `kind` and `typeRef` off the same object freely, so the union ripples too
 * widely and fights the existing nullable handling. Instead this invariant is
 * concentrated in the single normalizing constructor {@link toFilterFieldType}
 * (the only place a `FilterFieldType` is built from a classification) and honored
 * by the single emit-side reader (`emitFieldTypesLiteral`). Do not branch on
 * `typeRef` vs `kind` anywhere else.
 */
export interface FilterFieldType {
  /** Field name, e.g. 'age' or 'tasks.id' (dot-notation for relations). */
  name: string;
  kind: FieldTypeKind;
  /** String/number-literal union members (enums), if any. */
  enumValues?: string[];
  /** Whether the field's TS type includes null/undefined. */
  nullable?: boolean;
  /** True when enumValues are numeric literals (emit unquoted). */
  numericEnum?: boolean;
  /**
   * When the field's type is a named enum / type alias / interface inferred from
   * a `@FilterFor` method parameter, the importable reference to that symbol.
   * The emitter references `typeRef.name` in the type map M and emits a real
   * `import type { <name> } from '<path>'` at the top of the generated file.
   * Takes precedence over `kind`/`enumValues` when present (see invariant above).
   */
  typeRef?: TypeRef;
}

export interface ContractSource {
  query: string | null;
  body: string | null;
  response: string;
  queryRef?: TypeRef | null;
  bodyRef?: TypeRef | null;
  responseRef?: TypeRef | null;
  filterFields?: string[] | null;
  filterFieldTypes?: FilterFieldType[] | null;
  filterSource?: 'body' | 'query' | null;
  /** Raw zod source for the body schema (Path A inline, or Path B synthesized). */
  bodyZodText?: string | null;
  /** Importable named schema to re-export for the body (Path A). */
  bodyZodRef?: TypeRef | null;
  /** Raw zod source for the query schema (Path A inline, or Path B synthesized). */
  queryZodText?: string | null;
  /** Importable named schema to re-export for the query (Path A). */
  queryZodRef?: TypeRef | null;
  /** Hoisted nested schemas (name → zod text) referenced by body/query (Path B). */
  formNestedSchemas?: Record<string, string> | null;
  /** Unmappable-decorator warnings surfaced to console + a header comment. */
  formWarnings?: string[];
}

export interface ContractDescriptor {
  contractSource: ContractSource;
}

export interface ControllerRef {
  className: string;
  methodName: string;
  filePath: string;
}

export interface RouteDescriptor {
  method: string;
  path: string;
  name: string;
  params: Array<{ name: string; source: 'path' | 'query' | 'body' | 'header' }>;
  contract?: ContractDescriptor;
  controllerRef?: ControllerRef;
}

import {
  Node,
  type Project,
  type PropertyDeclaration,
  type SourceFile,
  SyntaxKind,
  type TypeNode,
} from 'ts-morph';
import { resolveEnumValues } from './enum-resolution.js';
import type { FieldTypeKind, FilterFieldType, TypeRef } from './types.js';

// ---------------------------------------------------------------------------
// Field-type classification (mirrors mapTypeOrmType / mapMikroOrmType so codegen
// and the runtime adapters can never diverge). See nestjs-filter
// packages/typeorm/src/typeorm.adapter.ts:190 (mapTypeOrmType).
// ---------------------------------------------------------------------------

/** Reference: typeorm.adapter.ts keyword tables (kept in sync intentionally). */
const STRING_TYPE_KEYWORDS = ['varchar', 'text', 'string', 'char', 'uuid', 'enum'];
const NUMBER_TYPE_KEYWORDS = ['int', 'float', 'double', 'decimal', 'number', 'numeric', 'real'];
const BOOLEAN_TYPE_KEYWORDS = ['bool', 'boolean', 'bit'];
const DATE_TYPE_KEYWORDS = ['date', 'time', 'timestamp', 'datetime'];
const JSON_TYPE_KEYWORDS = ['json', 'jsonb'];

/** Classify a column/property type literal (e.g. 'varchar') the same way mapTypeOrmType does. */
export function classifyTypeKeyword(raw: string): FieldTypeKind | null {
  const t = raw.toLowerCase();
  if (STRING_TYPE_KEYWORDS.some((s) => t.includes(s))) return 'string';
  if (NUMBER_TYPE_KEYWORDS.some((s) => t.includes(s))) return 'number';
  if (BOOLEAN_TYPE_KEYWORDS.some((s) => t.includes(s))) return 'boolean';
  if (DATE_TYPE_KEYWORDS.some((s) => t.includes(s))) return 'date';
  if (JSON_TYPE_KEYWORDS.some((s) => t.includes(s))) return 'json';
  return null;
}

export interface ClassifyResult {
  kind: FieldTypeKind;
  enumValues?: string[];
  nullable?: boolean;
  numericEnum?: boolean;
  /** Importable reference to a named enum / type alias / interface (option B). */
  typeRef?: TypeRef;
}

/**
 * Return `r` with `nullable: true` set only when `nullable` is true.
 * Avoids assigning `undefined` to an optional prop under exactOptionalPropertyTypes.
 */
export function markNullable(r: ClassifyResult, nullable: boolean): ClassifyResult {
  return nullable ? { ...r, nullable: true } : r;
}

/**
 * Options for {@link classifyTypeNode}. When `resolveRef` is supplied and the
 * type node is a named reference (not a primitive / well-known name), it is
 * called with the symbol name; a non-null result is attached as `typeRef` on the
 * returned `ClassifyResult`. This lets `classifyFilterForParam` classify ONCE and
 * pick up the importable ref in the same pass.
 */
export interface ClassifyTypeNodeOptions {
  resolveRef?: (refName: string) => TypeRef | null;
}

/** Classify a TS type node into a field-type kind (+ enum members / nullable). */
export function classifyTypeNode(
  typeNode: TypeNode,
  sourceFile: SourceFile,
  project: Project,
  opts?: ClassifyTypeNodeOptions,
): ClassifyResult {
  // Union: strip null/undefined, collect literal members, recurse otherwise.
  if (Node.isUnionTypeNode(typeNode)) {
    let nullable = false;
    const stringLits: string[] = [];
    const numberLits: string[] = [];
    const others: TypeNode[] = [];
    for (const member of typeNode.getTypeNodes()) {
      const kind = member.getKind();
      if (kind === SyntaxKind.NullKeyword || kind === SyntaxKind.UndefinedKeyword) {
        nullable = true;
        continue;
      }
      if (Node.isLiteralTypeNode(member)) {
        const lit = member.getLiteral();
        if (Node.isStringLiteral(lit)) {
          stringLits.push(lit.getLiteralValue());
          continue;
        }
        if (Node.isNumericLiteral(lit)) {
          numberLits.push(lit.getText());
          continue;
        }
        if (lit.getKind() === SyntaxKind.NullKeyword) {
          nullable = true;
          continue;
        }
      }
      others.push(member);
    }

    if (others.length === 0 && stringLits.length > 0 && numberLits.length === 0) {
      return markNullable({ kind: 'string', enumValues: stringLits }, nullable);
    }
    if (others.length === 0 && numberLits.length > 0 && stringLits.length === 0) {
      return markNullable({ kind: 'number', enumValues: numberLits, numericEnum: true }, nullable);
    }
    if (others.length === 1) {
      const inner = classifyTypeNode(others[0]!, sourceFile, project, opts);
      return markNullable(inner, nullable || inner.nullable === true);
    }
    return markNullable({ kind: 'unknown' }, nullable);
  }

  switch (typeNode.getKind()) {
    case SyntaxKind.StringKeyword:
      return { kind: 'string' };
    case SyntaxKind.NumberKeyword:
      return { kind: 'number' };
    case SyntaxKind.BooleanKeyword:
      return { kind: 'boolean' };
    case SyntaxKind.AnyKeyword:
    case SyntaxKind.UnknownKeyword:
      return { kind: 'unknown' };
    default:
      break;
  }

  if (Node.isTypeReference(typeNode)) {
    const refName = typeNode.getTypeName().getText();
    if (refName === 'Date') return { kind: 'date' };
    if (refName === 'Record' || refName === 'Object') return { kind: 'json' };
    // An importable named ref (enum / type alias / interface / class) wins for
    // emit when the caller supplied a resolver and a safe import path exists.
    const typeRef = opts?.resolveRef?.(refName) ?? null;
    // Possibly an enum type used as a property type.
    const en = resolveEnumValues(refName, sourceFile, project);
    if (en) {
      const base: ClassifyResult = en.numeric
        ? { kind: 'number', enumValues: en.values, numericEnum: true }
        : { kind: 'string', enumValues: en.values };
      return typeRef ? { ...base, typeRef } : base;
    }
    if (typeRef) return { kind: 'unknown', typeRef };
    return { kind: 'unknown' };
  }

  if (Node.isTypeLiteral(typeNode)) return { kind: 'json' };

  return { kind: 'unknown' };
}

/** Resolve an enum from @Enum decorator args: `() => Status` or `{ items: () => Status }`. */
export function enumFromDecoratorArgs(
  args: Node[],
  sourceFile: SourceFile,
  project: Project,
): { values: string[]; numeric: boolean } | null {
  for (const arg of args) {
    if (Node.isArrowFunction(arg)) {
      const body = arg.getBody();
      if (Node.isIdentifier(body)) {
        const en = resolveEnumValues(body.getText(), sourceFile, project);
        if (en) return en;
      }
    }
    if (Node.isObjectLiteralExpression(arg)) {
      const itemsProp = arg.getProperty('items');
      if (itemsProp && Node.isPropertyAssignment(itemsProp)) {
        const init = itemsProp.getInitializer();
        if (init && Node.isArrowFunction(init)) {
          const body = init.getBody();
          if (Node.isIdentifier(body)) {
            const en = resolveEnumValues(body.getText(), sourceFile, project);
            if (en) return en;
          }
        }
      }
    }
  }
  return null;
}

/** Classify a property from `@Column`/`@Property`/`@Enum` decorator options. */
export function classifyFromColumnDecorator(
  prop: PropertyDeclaration,
  sourceFile: SourceFile,
  project: Project,
): ClassifyResult | null {
  for (const dec of prop.getDecorators()) {
    const decName = dec.getName();
    if (decName !== 'Column' && decName !== 'Property' && decName !== 'Enum') continue;
    const args = dec.getArguments();

    // @Enum({ items: () => Status }) or @Enum(() => Status)
    if (decName === 'Enum') {
      const en = enumFromDecoratorArgs(args, sourceFile, project);
      if (en) {
        return en.numeric
          ? { kind: 'number', enumValues: en.values, numericEnum: true }
          : { kind: 'string', enumValues: en.values };
      }
      return { kind: 'string' };
    }

    for (const arg of args) {
      // @Column('varchar')
      if (Node.isStringLiteral(arg)) {
        const raw = arg.getLiteralValue();
        const kind = classifyTypeKeyword(raw);
        if (kind) {
          // @Column('enum', { enum: Status }) → resolve via the options object below
          if (kind === 'string' && raw.toLowerCase().includes('enum')) continue;
          return { kind };
        }
      }
      // @Column({ type: 'datetime' }) / @Property({ type: 'int' }) / { enum: Status }
      if (Node.isObjectLiteralExpression(arg)) {
        const enumProp = arg.getProperty('enum');
        if (enumProp && Node.isPropertyAssignment(enumProp)) {
          const init = enumProp.getInitializer();
          if (init && Node.isIdentifier(init)) {
            const en = resolveEnumValues(init.getText(), sourceFile, project);
            if (en) {
              return en.numeric
                ? { kind: 'number', enumValues: en.values, numericEnum: true }
                : { kind: 'string', enumValues: en.values };
            }
            return { kind: 'string' };
          }
        }
        const typeProp = arg.getProperty('type');
        if (typeProp && Node.isPropertyAssignment(typeProp)) {
          const init = typeProp.getInitializer();
          if (init && Node.isStringLiteral(init)) {
            const kind = classifyTypeKeyword(init.getLiteralValue());
            if (kind) return { kind };
          }
        }
      }
    }
    // Decorator present but no recognisable type info.
    return null;
  }
  return null;
}

/**
 * Classify a single entity/DTO property into a ClassifyResult (kind + enum + nullable),
 * mirroring the runtime ORM type mapping. Falls back to 'unknown' when unresolvable.
 */
export function classifyFieldType(
  prop: PropertyDeclaration,
  sourceFile: SourceFile,
  project: Project,
): ClassifyResult {
  let nullable = prop.hasQuestionToken();
  const typeNode = prop.getTypeNode();

  if (typeNode) {
    const r = classifyTypeNode(typeNode, sourceFile, project);
    if (r.nullable) nullable = true;
    if (r.kind !== 'unknown') return markNullable(r, nullable);
  }

  const fromDecorator = classifyFromColumnDecorator(prop, sourceFile, project);
  if (fromDecorator) {
    return markNullable(fromDecorator, nullable || fromDecorator.nullable === true);
  }

  return markNullable({ kind: 'unknown' }, nullable);
}

/**
 * The single normalizing constructor for a {@link FilterFieldType} from a
 * classification. Concentrates the `typeRef` precedence invariant (see the
 * `FilterFieldType` doc): `kind`/`enumValues`/`numericEnum` are always recorded
 * best-effort, and `typeRef` (when present) is what the emitter actually uses.
 * Build `FilterFieldType` values through here — not inline — so the convention
 * has exactly one enforcement point.
 */
export function toFilterFieldType(name: string, r: ClassifyResult): FilterFieldType {
  const ft: FilterFieldType = { name, kind: r.kind };
  if (r.enumValues && r.enumValues.length > 0) ft.enumValues = r.enumValues;
  if (r.nullable) ft.nullable = true;
  if (r.numericEnum) ft.numericEnum = true;
  if (r.typeRef) ft.typeRef = r.typeRef;
  return ft;
}

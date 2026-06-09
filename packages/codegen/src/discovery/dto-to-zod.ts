/**
 * Pure-AST translation of class-validator-decorated DTO classes into zod schema
 * source text. Reads decorator names + literal args via ts-morph — it never
 * imports class-validator at runtime.
 *
 * Precedence (handled by the caller): a `defineContract` body/query always wins;
 * this translator runs only when no contract schema is present.
 */
import {
  type ClassDeclaration,
  type Decorator,
  Node,
  type Project,
  type PropertyDeclaration,
  type SourceFile,
} from 'ts-morph';
import { findType } from './type-ref-resolution.js';

export interface DtoZodResult {
  /** e.g. `"z.object({ email: z.string().email() })"`. */
  schemaText: string;
  /** name → `"z.object({...})"` hoisted above the parent. */
  namedNestedSchemas: Map<string, string>;
  warnings: string[];
}

interface BuildContext {
  sourceFile: SourceFile;
  project: Project;
  namedNestedSchemas: Map<string, string>;
  warnings: string[];
  warnedDecorators: Set<string>;
  /** class name → emitted schema name (dedupe + alias). */
  emittedClasses: Map<string, string>;
  /** Class names currently being built (recursion guard). */
  visiting: Set<string>;
  /** Emitted schema names that turned out to be recursive (self-referential). */
  recursiveSchemas: Set<string>;
  depth: number;
}

/** Decorators we recognise as type/refinement overrides. */
const KNOWN_DECORATORS = new Set([
  'IsString',
  'IsNumber',
  'IsInt',
  'IsBoolean',
  'IsDate',
  'IsEmail',
  'IsUrl',
  'IsUUID',
  'MinLength',
  'MaxLength',
  'Length',
  'Min',
  'Max',
  'IsPositive',
  'IsNegative',
  'Matches',
  'IsEnum',
  'IsIn',
  'IsOptional',
  'IsNotEmpty',
  'IsArray',
  'ValidateNested',
  'Type',
  'IsObject',
  'Allow',
  'IsDefined',
]);

export function extractZodFromDto(
  classDecl: ClassDeclaration,
  sourceFile: SourceFile,
  project: Project,
): DtoZodResult {
  const ctx: BuildContext = {
    sourceFile,
    project,
    namedNestedSchemas: new Map(),
    warnings: [],
    warnedDecorators: new Set(),
    emittedClasses: new Map(),
    visiting: new Set(),
    recursiveSchemas: new Set(),
    depth: 0,
  };
  const schemaText = buildObjectSchema(classDecl, sourceFile, ctx);
  // Recursive schemas cannot be hoisted as a plain `const X = z.object({... X ...})`
  // without an explicit type annotation (TS7022/TS7024: implicit any). Per the
  // generator's "never emit invalid TypeScript" policy, degrade any
  // self-referential nested schema to a valid `z.unknown()` placeholder.
  for (const schemaName of ctx.recursiveSchemas) {
    ctx.namedNestedSchemas.set(schemaName, 'z.unknown() /* recursive type — not expanded */');
  }
  return {
    schemaText,
    namedNestedSchemas: ctx.namedNestedSchemas,
    warnings: ctx.warnings,
  };
}

// ---------------------------------------------------------------------------
// Object builder
// ---------------------------------------------------------------------------

function buildObjectSchema(
  classDecl: ClassDeclaration,
  classFile: SourceFile,
  ctx: BuildContext,
): string {
  const props = classDecl.getProperties();
  if (props.length === 0) {
    return 'z.object({}).passthrough()';
  }
  const fields: string[] = [];
  for (const prop of props) {
    const name = prop.getName();
    const expr = buildPropertySchema(prop, classFile, ctx);
    fields.push(`${toObjectKey(name)}: ${expr}`);
  }
  return `z.object({ ${fields.join(', ')} })`;
}

function toObjectKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

// ---------------------------------------------------------------------------
// Property builder — the §2.2 mapping table lives here.
// ---------------------------------------------------------------------------

function buildPropertySchema(
  prop: PropertyDeclaration,
  classFile: SourceFile,
  ctx: BuildContext,
): string {
  const decorators = new Map<string, Decorator>();
  for (const d of prop.getDecorators()) decorators.set(d.getName(), d);

  const has = (n: string): boolean => decorators.has(n);
  const dec = (n: string): Decorator | undefined => decorators.get(n);

  const typeNode = prop.getTypeNode();
  const typeText = typeNode?.getText() ?? 'unknown';
  const isArrayType = !!typeNode && typeNode.getText().endsWith('[]');

  // Track unmappable comments to append.
  const comments: string[] = [];

  // ── Nested / array-of-nested via @ValidateNested + @Type ────────────────
  const typeRefName = resolveTypeFactoryName(dec('Type'));
  if (has('ValidateNested') || typeRefName) {
    const childName = typeRefName ?? singularClassName(typeText);
    if (childName) {
      const childExpr = buildNestedReference(childName, classFile, ctx);
      const wrapArray = has('IsArray') || isArrayType;
      let expr = wrapArray ? `z.array(${childExpr})` : childExpr;
      expr = applyPresence(expr, decorators);
      return expr;
    }
  }

  // ── Base type (TS property type), then decorator refinements ────────────
  let base = baseFromType(typeText, isArrayType, ctx, classFile);
  const refinements: string[] = [];

  // Type overrides
  if (has('IsString')) base = 'z.string()';
  if (has('IsBoolean')) base = 'z.boolean()';
  if (has('IsDate')) base = 'z.coerce.date()';
  if (has('IsNumber')) base = 'z.number()';
  if (has('IsInt')) base = 'z.number().int()';
  if (has('IsObject') && !has('ValidateNested')) base = 'z.object({}).passthrough()';
  if (has('Allow')) base = 'z.unknown()';

  // String format refinements (these also imply string base).
  if (has('IsEmail')) {
    base = ensureStringBase(base);
    refinements.push(`.email(${messageArg(dec('IsEmail'))})`);
  }
  if (has('IsUrl')) {
    base = ensureStringBase(base);
    refinements.push(`.url(${messageArg(dec('IsUrl'))})`);
  }
  if (has('IsUUID')) {
    base = ensureStringBase(base);
    refinements.push(`.uuid(${messageArg(dec('IsUUID'))})`);
  }
  if (has('Matches')) {
    const re = firstArgText(dec('Matches'));
    if (re) {
      base = ensureStringBase(base);
      refinements.push(`.regex(${re})`);
    }
  }

  // Length / size refinements
  if (has('MinLength')) {
    const n = numericArg(dec('MinLength'));
    if (n !== null) refinements.push(`.min(${n})`);
  }
  if (has('MaxLength')) {
    const n = numericArg(dec('MaxLength'));
    if (n !== null) refinements.push(`.max(${n})`);
  }
  if (has('Length')) {
    const [min, max] = numericArgs(dec('Length'));
    if (min !== null) refinements.push(`.min(${min})`);
    if (max !== null) refinements.push(`.max(${max})`);
  }
  if (has('Min')) {
    const n = numericArg(dec('Min'));
    if (n !== null) refinements.push(`.min(${n})`);
  }
  if (has('Max')) {
    const n = numericArg(dec('Max'));
    if (n !== null) refinements.push(`.max(${n})`);
  }
  if (has('IsPositive')) refinements.push('.positive()');
  if (has('IsNegative')) refinements.push('.negative()');
  if (has('IsNotEmpty') && isStringBase(base)) refinements.push('.min(1)');

  // Enum / membership
  if (has('IsEnum')) {
    const enumExpr = enumSchemaFromDecorator(dec('IsEnum'), classFile, ctx);
    if (enumExpr) base = enumExpr;
  }
  if (has('IsIn')) {
    const inExpr = inSchemaFromDecorator(dec('IsIn'));
    if (inExpr) base = inExpr;
  }

  // ── Unmappable decorators → warn + comment, keep base ───────────────────
  for (const name of decorators.keys()) {
    if (!KNOWN_DECORATORS.has(name)) {
      // Block comment, not `//` — the schema is emitted on a single line, so a
      // line comment would swallow the rest of the object literal (the closing
      // `})` and any following fields), producing invalid TypeScript.
      comments.push(`/* @${name}: not translatable to zod (server-only) */`);
      if (!ctx.warnedDecorators.has(name)) {
        ctx.warnedDecorators.add(name);
        const msg = `@${name} is not translatable to zod and was skipped (server-only validation).`;
        ctx.warnings.push(msg);
        console.warn(`[nestjs-inertia-codegen/forms] ${msg}`);
      }
    }
  }

  let expr = base + refinements.join('');

  // Array wrapping when the TS type is `T[]` and no nested handling occurred.
  if (isArrayType && !expr.startsWith('z.array(')) {
    expr = `z.array(${expr})`;
  }

  expr = applyPresence(expr, decorators);

  if (comments.length > 0) {
    expr = `${expr} ${comments.join(' ')}`;
  }
  return expr;
}

/** `.optional()` / required handling from @IsOptional / @IsDefined. */
function applyPresence(expr: string, decorators: Map<string, Decorator>): string {
  if (decorators.has('IsDefined')) return expr; // explicitly required
  if (decorators.has('IsOptional')) return `${expr}.optional()`;
  return expr;
}

// ---------------------------------------------------------------------------
// Base type from the TS property type
// ---------------------------------------------------------------------------

function baseFromType(
  typeText: string,
  isArrayType: boolean,
  ctx: BuildContext,
  classFile: SourceFile,
): string {
  const inner = isArrayType ? typeText.slice(0, -2).trim() : typeText;
  switch (inner) {
    case 'string':
      return 'z.string()';
    case 'number':
      return 'z.number()';
    case 'boolean':
      return 'z.boolean()';
    case 'Date':
      return 'z.coerce.date()';
    case 'File':
    case 'Express.Multer.File':
      return 'z.instanceof(File)';
    default:
      return 'z.unknown()';
  }
}

function ensureStringBase(base: string): string {
  return isStringBase(base) ? base : 'z.string()';
}

function isStringBase(base: string): boolean {
  return base.startsWith('z.string(');
}

// ---------------------------------------------------------------------------
// Nested DTO references (hoisted named consts)
// ---------------------------------------------------------------------------

function buildNestedReference(className: string, fromFile: SourceFile, ctx: BuildContext): string {
  // Recursion guard FIRST: a class currently being built (cycle) or excessive
  // depth → emit a lazy reference to the (already-reserved) schema name.
  if (ctx.visiting.has(className) || ctx.depth >= 8) {
    const reserved = ctx.emittedClasses.get(className) ?? aliasFor(className, ctx);
    ctx.emittedClasses.set(className, reserved);
    // This schema references itself (directly or transitively). Record it so the
    // hoisted declaration is degraded to a valid annotation-free placeholder
    // instead of an implicit-any `const X = z.lazy(() => ... X ...)`.
    ctx.recursiveSchemas.add(reserved);
    if (!ctx.warnedDecorators.has(`recursive:${reserved}`)) {
      ctx.warnedDecorators.add(`recursive:${reserved}`);
      const msg = `${className} is a recursive type and was not expanded; the generated form schema uses z.unknown() for it.`;
      ctx.warnings.push(msg);
      console.warn(`[nestjs-inertia-codegen/forms] ${msg}`);
    }
    return `z.lazy(() => ${reserved})`;
  }

  const existing = ctx.emittedClasses.get(className);
  if (existing) return existing;

  const schemaName = aliasFor(className, ctx);
  const resolved = findType(className, fromFile, ctx.project);
  if (!resolved || resolved.kind !== 'class') {
    // Unknown nested type — passthrough object.
    return 'z.object({}).passthrough()';
  }

  ctx.emittedClasses.set(className, schemaName);
  ctx.visiting.add(className);
  ctx.depth += 1;
  const childText = buildObjectSchema(resolved.decl, resolved.file, ctx);
  ctx.depth -= 1;
  ctx.visiting.delete(className);

  ctx.namedNestedSchemas.set(schemaName, childText);
  return schemaName;
}

function aliasFor(className: string, ctx: BuildContext): string {
  const baseName = `${className}Schema`;
  let candidate = baseName;
  let i = 1;
  const used = new Set(ctx.namedNestedSchemas.keys());
  for (const v of ctx.emittedClasses.values()) used.add(v);
  while (used.has(candidate)) {
    candidate = `${baseName}_${i}`;
    i += 1;
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// Decorator argument readers (pure AST)
// ---------------------------------------------------------------------------

function firstArg(decorator: Decorator | undefined): Node | undefined {
  return decorator?.getArguments()[0];
}

function firstArgText(decorator: Decorator | undefined): string | null {
  const arg = firstArg(decorator);
  return arg ? arg.getText() : null;
}

function numericArg(decorator: Decorator | undefined): string | null {
  const arg = firstArg(decorator);
  if (arg && Node.isNumericLiteral(arg)) return arg.getText();
  return null;
}

function numericArgs(decorator: Decorator | undefined): [string | null, string | null] {
  const args = decorator?.getArguments() ?? [];
  const num = (n: Node | undefined): string | null =>
    n && Node.isNumericLiteral(n) ? n.getText() : null;
  return [num(args[0]), num(args[1])];
}

/** Reads a `{ message: '...' }` options object → `{ message: '...' }` (or empty). */
function messageArg(decorator: Decorator | undefined): string {
  const args = decorator?.getArguments() ?? [];
  for (const arg of args) {
    if (Node.isObjectLiteralExpression(arg)) {
      for (const prop of arg.getProperties()) {
        if (Node.isPropertyAssignment(prop) && prop.getName() === 'message') {
          const init = prop.getInitializer();
          if (init && Node.isStringLiteral(init)) {
            return `{ message: ${init.getText()} }`;
          }
        }
      }
    }
  }
  return '';
}

/** Resolve `@Type(() => Child)` → `'Child'`. */
function resolveTypeFactoryName(decorator: Decorator | undefined): string | null {
  const arg = firstArg(decorator);
  if (!arg) return null;
  if (Node.isArrowFunction(arg)) {
    const body = arg.getBody();
    if (Node.isIdentifier(body)) return body.getText();
  }
  return null;
}

/** Drop array suffix from a type text → class name (`Child[]` → `Child`). */
function singularClassName(typeText: string): string | null {
  const inner = typeText.endsWith('[]') ? typeText.slice(0, -2).trim() : typeText;
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(inner) ? inner : null;
}

/** `@IsEnum(E)` → `z.nativeEnum(E)` (or `z.enum([...])` from resolved members). */
function enumSchemaFromDecorator(
  decorator: Decorator | undefined,
  classFile: SourceFile,
  ctx: BuildContext,
): string | null {
  const arg = firstArg(decorator);
  if (!arg) return null;
  if (Node.isIdentifier(arg)) {
    const name = arg.getText();
    const resolved = findType(name, classFile, ctx.project);
    if (resolved && resolved.kind === 'enum') {
      // resolved.members are already JSON-stringified literals.
      return `z.enum([${resolved.members.join(', ')}])`;
    }
    // The enum could not be resolved to literal members. Emitting
    // `z.nativeEnum(${name})` would reference an identifier that is NOT imported
    // into the generated forms file → a `Cannot find name` compile error. Fall
    // back to a valid degraded schema instead (same policy as untranslatable
    // decorators): a passing schema beats invalid output.
    const msg = `@IsEnum(${name}): enum could not be resolved to literal members and is not importable into the generated form schema; falling back to z.unknown().`;
    if (!ctx.warnedDecorators.has(`IsEnum:${name}`)) {
      ctx.warnedDecorators.add(`IsEnum:${name}`);
      ctx.warnings.push(msg);
      console.warn(`[nestjs-inertia-codegen/forms] ${msg}`);
    }
    return `z.unknown() /* @IsEnum(${name}): enum not resolvable to literals */`;
  }
  if (Node.isObjectLiteralExpression(arg)) {
    const values: string[] = [];
    for (const p of arg.getProperties()) {
      if (!Node.isPropertyAssignment(p)) continue;
      const init = p.getInitializer();
      if (init && Node.isStringLiteral(init)) values.push(init.getText());
    }
    if (values.length > 0) return `z.enum([${values.join(', ')}])`;
  }
  return null;
}

/** `@IsIn(['a','b'])` → `z.enum(['a','b'])`. */
function inSchemaFromDecorator(decorator: Decorator | undefined): string | null {
  const arg = firstArg(decorator);
  if (arg && Node.isArrayLiteralExpression(arg)) {
    const elements = arg.getElements();
    const allStrings = elements.every((e) => Node.isStringLiteral(e));
    if (allStrings && elements.length > 0) {
      return `z.enum([${elements.map((e) => e.getText()).join(', ')}])`;
    }
    if (elements.length > 0) {
      return `z.union([${elements.map((e) => `z.literal(${e.getText()})`).join(', ')}])`;
    }
  }
  return null;
}

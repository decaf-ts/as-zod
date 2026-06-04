import {
  Model,
  ModelBuilder,
  AttributeBuilder,
  ModelKeys,
  TypeMetadata,
  Primitives,
  DEFAULT_ERROR_MESSAGES,
  ValidatorOptions,
  MinLengthValidatorOptions,
  MinValidatorOptions,
  MaxValidatorOptions,
  MaxLengthValidatorOptions,
  StepValidatorOptions,
  PatternValidatorOptions,
  ListMetadata,
  ExtendedMetadata,
} from "@decaf-ts/decorator-validation";
import { Metadata, Constructor } from "@decaf-ts/decoration";
import {
  z,
  ZodAny,
  ZodArray,
  ZodBigInt,
  ZodBoolean,
  ZodCatch,
  ZodDate,
  ZodDefault,
  ZodEnum,
  ZodLazy,
  ZodLiteral,
  ZodNullable,
  ZodNull,
  ZodNumber,
  ZodObject,
  ZodOptional,
  ZodSet,
  ZodString,
  ZodTypeAny,
  ZodUnion,
  ZodUnknown,
} from "zod";
import { ValidationKeys } from "@decaf-ts/decorator-validation";

const ReservedKeys = [
  ValidationKeys.REQUIRED,
  ValidationKeys.TYPE,
  ValidationKeys.DATE,
  ModelKeys.TYPE,
] as const;

function isReservedKey(el: string) {
  return ReservedKeys.includes(el as any);
}

type DecoratorData = Record<string, any>;
type BuildableModel = Model & Record<PropertyKey, any>;

const AS_ZOD_MODEL_NAME = "__decafModelName";

type TypeRef =
  | Constructor
  | (() => Constructor)
  | (Constructor | (() => Constructor))[];

interface BuildState<T extends Model = Model> {
  ctor?: Constructor<T>;
  ref: () => Constructor<T>;
}

interface ZodToModelContext {
  states: WeakMap<ZodTypeAny, BuildState<any>>;
  inProgress: WeakSet<ZodTypeAny>;
  sequence: number;
}

function createContext(): ZodToModelContext {
  return {
    states: new WeakMap(),
    inProgress: new WeakSet(),
    sequence: 0,
  };
}

function sanitizeClassName(name: string, fallback = "GeneratedModel") {
  const normalized = name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

  if (!normalized) return fallback;
  if (/^[0-9]/.test(normalized)) return `${fallback}${normalized}`;
  return normalized;
}

function schemaModelName(schema: ZodTypeAny) {
  return (schema as any)[AS_ZOD_MODEL_NAME] as string | undefined;
}

function attachSchemaModelName(schema: ZodTypeAny, name: string) {
  Object.defineProperty(schema, AS_ZOD_MODEL_NAME, {
    value: name,
    enumerable: false,
    configurable: true,
    writable: true,
  });
}

function schemaDescription(schema: ZodTypeAny) {
  return schema.description || undefined;
}

function getBuildState(
  schema: ZodTypeAny,
  ctx: ZodToModelContext
): BuildState<any> {
  const existing = ctx.states.get(schema);
  if (existing) return existing;

  let ctor: Constructor<any> | undefined;
  const state: BuildState<any> = {
    get ctor() {
      return ctor;
    },
    set ctor(value: Constructor<any> | undefined) {
      ctor = value;
    },
    ref: () => {
      if (!ctor) {
        throw new Error("Recursive Zod schema referenced before model build");
      }
      return ctor;
    },
  };
  ctx.states.set(schema, state);
  return state;
}

function isNullSchema(schema: ZodTypeAny) {
  return schema instanceof ZodNull;
}

function isUndefinedSchema(schema: ZodTypeAny) {
  return schema.constructor.name === "ZodUndefined";
}

function isAnyLike(schema: ZodTypeAny) {
  return schema instanceof ZodAny || schema instanceof ZodUnknown;
}

function unwrapSchema(schema: ZodTypeAny) {
  let optional = false;
  let nullable = false;
  let current: any = schema;

  for (;;) {
    if (current instanceof ZodOptional) {
      optional = true;
      current = current._def.innerType;
      continue;
    }
    if (current instanceof ZodNullable) {
      nullable = true;
      current = current._def.innerType;
      continue;
    }
    if (current instanceof ZodLazy) {
      current = current._def.getter();
      continue;
    }
    if (current instanceof ZodUnion) {
      const options = current._def.options as ZodTypeAny[];
      let remaining = options;

      if (remaining.some(isNullSchema)) {
        nullable = true;
        remaining = remaining.filter((option) => !isNullSchema(option));
      }

      if (remaining.some(isUndefinedSchema)) {
        optional = true;
        remaining = remaining.filter((option) => !isUndefinedSchema(option));
      }

      if (!remaining.length) {
        throw new Error(
          "Unsupported schema: union only contains null/undefined"
        );
      }

      if (remaining.length === 1) {
        current = remaining[0];
        continue;
      }

      if (remaining.length !== options.length) {
        current = z.union(remaining as [ZodTypeAny, ZodTypeAny]);
        continue;
      }
    }
    break;
  }

  return { schema: current, optional, nullable };
}

function literalToValue(schema: ZodLiteral<any>) {
  const values = schema._def.values as any[];
  return values.length === 1 ? values[0] : values;
}

function checkDef(check: any) {
  return check?._zod?.def ?? check?.def ?? check;
}

function ensureCtorName(
  schema: ZodTypeAny,
  fallback: string,
  explicit?: string
) {
  return sanitizeClassName(
    explicit ??
      schemaModelName(schema) ??
      schemaDescription(schema) ??
      fallback,
    fallback
  );
}

function modelNameForPath(path: string[], fallback: string) {
  if (!path.length) return fallback;
  return sanitizeClassName(
    path.map((part) => part.replace(/[^a-zA-Z0-9]/g, " ")).join(" ")
  );
}

class ZodAttributeBuilder<
  M extends Model,
  N extends keyof M,
> extends AttributeBuilder<M, N, Constructor | undefined> {
  private readonly decoratorData: DecoratorData;
  private readonly attributeDescription?: string;

  constructor(
    parent: ModelBuilder<M>,
    attr: N,
    declaredType: Constructor | undefined,
    decoratorData: DecoratorData,
    description?: string
  ) {
    super(parent, attr, declaredType as Constructor | undefined);
    this.decoratorData = decoratorData;
    this.attributeDescription = description;
  }

  private safeInvoke(value: unknown) {
    if (typeof value !== "function") {
      return value;
    }
    if ((value as { prototype?: unknown }).prototype) {
      return value;
    }
    try {
      return (value as () => unknown)();
    } catch {
      return value;
    }
  }

  private typeName(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "function") {
      return value.name || value.toString();
    }
    if (value && typeof value === "object" && "name" in (value as any)) {
      const name = (value as { name?: string }).name;
      if (name) return name;
    }
    return String(value);
  }

  private normalizeTypes(input: TypeMetadata["customTypes"]): string[] {
    const asArray = Array.isArray(input) ? input : [input];
    return asArray.map((entry) => {
      const resolved = this.safeInvoke(entry);
      return this.typeName(resolved);
    });
  }

  private resolveListTypes(listMeta: ListMetadata) {
    const classes = Array.isArray(listMeta.clazz)
      ? listMeta.clazz
      : [listMeta.clazz];
    return classes.map((clazz) => {
      const resolved = this.safeInvoke(clazz);
      return this.typeName(resolved);
    });
  }

  buildSchema() {
    if (!Object.keys(this.decoratorData).length) {
      return undefined;
    }

    const typeData = this.decoratorData[ValidationKeys.TYPE] as
      | TypeMetadata
      | undefined;

    if (!typeData) {
      throw new Error(`Missing type information`);
    }

    let zodSchema = zodify(
      this.normalizeTypes(typeData.customTypes),
      this.decoratorData[ValidationKeys.LIST]
        ? zodify(
            this.resolveListTypes(
              this.decoratorData[ValidationKeys.LIST] as ListMetadata
            )
          )
        : ZodAny
    );

    for (const [key, props] of Object.entries(this.decoratorData).filter(
      ([k]) => !isReservedKey(k)
    )) {
      zodSchema = zodifyValidation(zodSchema, key, props);
    }

    if (!this.decoratorData[ValidationKeys.REQUIRED]) {
      zodSchema = zodSchema.optional();
    }

    if (this.attributeDescription) {
      zodSchema = zodSchema.describe(this.attributeDescription);
    }

    return zodSchema;
  }
}

class ZodModelBuilder<
  M extends Model,
  META extends ExtendedMetadata<M>,
> extends ModelBuilder<M> {
  constructor(
    private readonly target: Constructor<M>,
    private readonly metadata: META
  ) {
    super();
  }

  private decoratorDataFor(prop: keyof M) {
    const validations =
      ((this.metadata.validation as Record<keyof M, DecoratorData>) ??
        ({} as Record<keyof M, DecoratorData>))[prop] ?? {};
    const decoratorData: DecoratorData = { ...validations };

    if (!decoratorData[ValidationKeys.TYPE]) {
      const designType = (
        this.metadata.properties as
          | Record<string, Constructor | { name?: string }>
          | undefined
      )?.[prop as string];
      const typeName =
        typeof designType === "function"
          ? designType.name
          : typeof designType?.name === "string"
            ? designType.name
            : undefined;
      if (typeName) {
        decoratorData[ValidationKeys.TYPE] = {
          customTypes: [typeName],
          message: DEFAULT_ERROR_MESSAGES.TYPE,
          description: "defines the accepted types for the attribute",
        } as unknown as TypeMetadata;
      }
    }

    return decoratorData;
  }

  toZodObject() {
    const result: Record<string, any> = {};
    const properties = Model.getAttributes(this.target);
    if (Array.isArray(properties) && properties.length) {
      for (const prop of properties) {
        if (
          typeof prop !== "string" ||
          prop === "constructor" ||
          prop.startsWith("_")
        ) {
          continue;
        }

        if (typeof (this.target as any)[prop] === "function") {
          continue;
        }

        const decoratorData = this.decoratorDataFor(prop as keyof M);
        if (!Object.keys(decoratorData).length) continue;

        const attributeBuilder = new ZodAttributeBuilder(
          this as ModelBuilder<M>,
          prop as keyof M,
          (this.metadata.properties as Record<string, Constructor>)?.[
            prop as string
          ],
          decoratorData,
          Metadata.description(this.target as any, prop as any) ??
            (this.metadata.description as Record<string, string> | undefined)?.[
              prop as string
            ]
        );
        const schema = attributeBuilder.buildSchema();
        if (schema) {
          result[prop] = schema;
        }
      }
    }

    const description =
      Metadata.description(this.target as any) ??
      (this.metadata.description as Record<string, string> | undefined)?.class;
    const objectSchema = z.object(result);
    return description ? objectSchema.describe(description) : objectSchema;
  }
}

export function zodify(type: string | string[], zz: any = ZodAny) {
  type = typeof type === "string" ? [type] : type;

  function innerZodify(type: string) {
    switch (type.toLowerCase()) {
      case Primitives.STRING:
        return z.string();
      case Primitives.NUMBER:
        return z.number();
      case Primitives.BIGINT:
        return z.bigint();
      case Primitives.BOOLEAN:
        return z.boolean();
      case ValidationKeys.DATE:
        return z.date();
      case "object":
        return z.any();
      case "any":
        return z.any();
      case "unknown":
        return z.unknown();
      case Array.name.toLowerCase():
        return z.array(zz);
      case Set.name.toLowerCase(): {
        const setSchema = z.set(zz);
        if (typeof (setSchema as any).valueSchema === "undefined") {
          Object.defineProperty(setSchema, "valueSchema", {
            get: () => (setSchema as any)._def?.valueType,
            enumerable: false,
            configurable: true,
          });
        }
        return setSchema;
      }
      default: {
        const m = Model.get(type);
        if (!m) {
          throw new Error(`Unzodifiable type: ${type}`);
        }
        try {
          const zz = z.from(m);
          return zz;
        } catch (e: unknown) {
          throw new Error(`Failed to zodify model ${type}: ${e}`);
        }
      }
    }
  }

  let zod: any;
  for (const t of type) {
    zod = zod ? zod.or(innerZodify(t)) : innerZodify(t);
  }

  return zod;
}

export function zodifyValidation(
  zod: any,
  type: string,
  values: ValidatorOptions
) {
  switch (type) {
    case ValidationKeys.MIN:
      return zod.min((values as MinValidatorOptions)[ValidationKeys.MIN]);
    case ValidationKeys.MIN_LENGTH:
      return zod.min(
        (values as MinLengthValidatorOptions)[ValidationKeys.MIN_LENGTH]
      );
    case ValidationKeys.MAX:
      return zod.max((values as MaxValidatorOptions)[ValidationKeys.MAX]);
    case ValidationKeys.MAX_LENGTH:
      return zod.max(
        (values as MaxLengthValidatorOptions)[ValidationKeys.MAX_LENGTH]
      );
    case ValidationKeys.STEP:
      return zod.multipleOf(
        (values as StepValidatorOptions)[ValidationKeys.STEP]
      );
    case ValidationKeys.ENUM: {
      const raw = (values as Record<string, any>)[ValidationKeys.ENUM];
      const entries = Array.isArray(raw) ? raw : Object.values(raw ?? {});
      if (!entries.length) return zod;
      if (entries.every((entry) => typeof entry === "string")) {
        return z.enum(entries as [string, ...string[]]);
      }
      if (entries.length === 1) {
        return z.literal(entries[0]);
      }
      return z.union(entries.map((entry) => z.literal(entry)) as any);
    }
    case ValidationKeys.PATTERN:
    case ValidationKeys.URL:
    case ValidationKeys.EMAIL:
    case ValidationKeys.PASSWORD:
      return zod.regex(
        new RegExp(
          (values as PatternValidatorOptions)[ValidationKeys.PATTERN] as string,
          "g"
        )
      );
    case ValidationKeys.DATE:
      // DATE decorator is handled via @type(Date) and parsing; do not re-wrap here
      throw new TypeError("DATE validator cannot be applied as a refinement");
    default:
      return zod;
  }
}

export function modelToZod<M extends Model, META extends ExtendedMetadata<M>>(
  model: M | Constructor<M>
) {
  const ctor =
    model instanceof Model ? (model.constructor as Constructor<M>) : model;
  const fullMeta: META | undefined = Metadata.get(ctor as any) as META;
  const builder = new ZodModelBuilder(
    ctor as Constructor<M>,
    (fullMeta ?? { validation: {}, properties: {}, description: {} }) as META
  );
  const schema = builder.toZodObject();
  attachSchemaModelName(schema, ctor.name);
  return schema;
}

function applyStringChecks(
  attribute: AttributeBuilder<BuildableModel, any, any>,
  schema: ZodString
) {
  for (const check of schema._def.checks || []) {
    const def = checkDef(check);
    switch (def.check) {
      case "min_length":
        attribute.minlength(def.minimum);
        break;
      case "max_length":
        attribute.maxlength(def.maximum);
        break;
      case "string_format":
        if (def.format === "email") {
          attribute.email();
          break;
        }
        if (def.format === "url") {
          attribute.url();
          break;
        }
        if (def.pattern) {
          attribute.pattern(def.pattern);
          break;
        }
        throw new Error(`Unsupported string format "${def.format}"`);
      default:
        throw new Error(`Unsupported string validation "${def.check}"`);
    }
  }
}

function applyNumberChecks(
  attribute: AttributeBuilder<BuildableModel, any, any>,
  schema: ZodNumber
) {
  for (const check of schema._def.checks || []) {
    const def = checkDef(check);
    switch (def.check) {
      case "greater_than":
        attribute.min(def.value);
        break;
      case "less_than":
        attribute.max(def.value);
        break;
      case "multiple_of":
        attribute.step(def.value);
        break;
      case "number_format":
        break;
      default:
        throw new Error(`Unsupported number validation "${def.check}"`);
    }
  }
}

function applyDateChecks(
  attribute: AttributeBuilder<BuildableModel, any, any>,
  schema: ZodDate
) {
  for (const check of schema._def.checks || []) {
    const def = checkDef(check);
    switch (def.check) {
      case "greater_than":
        attribute.min(def.value);
        break;
      case "less_than":
        attribute.max(def.value);
        break;
      default:
        throw new Error(`Unsupported date validation "${def.check}"`);
    }
  }
}

function applyArrayChecks(
  attribute: AttributeBuilder<BuildableModel, any, any>,
  schema: ZodArray<any>
) {
  for (const check of schema._def.checks || []) {
    const def = checkDef(check);
    switch (def.check) {
      case "min_length":
        attribute.minlength(def.minimum);
        break;
      case "max_length":
        attribute.maxlength(def.maximum);
        break;
      default:
        throw new Error(`Unsupported array validation "${def.check}"`);
    }
  }
}

function applySetChecks(
  attribute: AttributeBuilder<BuildableModel, any, any>,
  schema: ZodSet<any>
) {
  for (const check of schema._def.checks || []) {
    const def = checkDef(check);
    switch (def.check) {
      case "min_size":
        attribute.minlength(def.minimum);
        break;
      case "max_size":
        attribute.maxlength(def.maximum);
        break;
      default:
        throw new Error(`Unsupported set validation "${def.check}"`);
    }
  }
}

function resolveObjectConstructor(
  schema: ZodObject<any>,
  ctx: ZodToModelContext,
  nameHint: string
) {
  const state = getBuildState(schema, ctx);
  if (state.ctor) return state.ctor;
  if (ctx.inProgress.has(schema)) return state.ref;
  return buildModelFromSchema(schema, ctx, nameHint);
}

function resolveTypeRefs(
  schema: ZodTypeAny,
  ctx: ZodToModelContext,
  path: string[]
): { refs: TypeRef[]; enumValues?: any[] } {
  const { schema: core } = unwrapSchema(schema);

  if (isAnyLike(core)) {
    return { refs: [Object] };
  }

  if (core instanceof ZodString) {
    return { refs: [String] };
  }
  if (core instanceof ZodNumber) {
    return { refs: [Number] };
  }
  if (core instanceof ZodBoolean) {
    return { refs: [Boolean] };
  }
  if (core instanceof ZodBigInt) {
    return { refs: [BigInt as any] };
  }
  if (core instanceof ZodDate) {
    return { refs: [Date] };
  }
  if (core instanceof ZodObject) {
    const hint = ensureCtorName(core, modelNameForPath(path, "NestedModel"));
    const ctor = resolveObjectConstructor(core, ctx, hint);
    return { refs: [ctor] };
  }
  if (core instanceof ZodEnum) {
    return { refs: [], enumValues: Object.values(core._def.entries) };
  }
  if (core instanceof ZodLiteral) {
    return { refs: [], enumValues: [literalToValue(core)] };
  }
  if (core instanceof ZodUnion) {
    const flattenedRefs: TypeRef[] = [];
    const flattenedEnumValues: any[] = [];

    for (const option of core._def.options as ZodTypeAny[]) {
      const resolved = resolveTypeRefs(option, ctx, path);
      if (resolved.enumValues) {
        flattenedEnumValues.push(...resolved.enumValues);
      } else {
        flattenedRefs.push(...resolved.refs);
      }
    }

    if (flattenedRefs.some((ref) => ref === Object)) {
      return { refs: [Object] };
    }

    if (flattenedEnumValues.length && flattenedRefs.length) {
      throw new Error(
        `Unsupported union at ${path.join(".") || "<root>"}: mixes enums/literals with types`
      );
    }

    if (flattenedEnumValues.length) {
      return { refs: [], enumValues: flattenedEnumValues };
    }

    const uniqueRefs = [...new Set(flattenedRefs)];
    if (!uniqueRefs.length) {
      throw new Error(
        `Unsupported empty union at ${path.join(".") || "<root>"}`
      );
    }
    return { refs: uniqueRefs };
  }

  if (
    core instanceof ZodDefault ||
    core instanceof ZodCatch ||
    core.constructor.name === "ZodReadonly" ||
    core.constructor.name === "ZodBranded"
  ) {
    throw new Error(
      `Unsupported Zod wrapper "${core.constructor.name}" at ${path.join(".") || "<root>"}`
    );
  }

  if (core instanceof ZodArray || core instanceof ZodSet) {
    const elementSchema = (
      core instanceof ZodArray ? core._def.element : core._def.valueType
    ) as ZodTypeAny;
    const element = resolveTypeRefs(elementSchema, ctx, path);
    if (element.enumValues) {
      throw new Error(
        `Unsupported collection element enum at ${path.join(".") || "<root>"}`
      );
    }
    return { refs: element.refs };
  }

  throw new Error(
    `Unsupported Zod schema "${core.constructor.name}" at ${path.join(".") || "<root>"}`
  );
}

function applySchemaToAttribute(
  builder: ModelBuilder<BuildableModel>,
  prop: string,
  schema: ZodTypeAny,
  ctx: ZodToModelContext,
  path: string[]
) {
  const { schema: core, optional } = unwrapSchema(schema);
  const description = schemaDescription(schema);
  const resolved = resolveTypeRefs(core, ctx, path);

  let attribute: AttributeBuilder<BuildableModel, any, any>;
  if (resolved.enumValues) {
    attribute = builder.instance(Object as any, prop as any);
    attribute.enum(resolved.enumValues);
  } else if (core instanceof ZodArray) {
    attribute = builder.instance(Array as any, prop as any);
    attribute.list(resolved.refs as any, "Array");
    applyArrayChecks(attribute, core);
  } else if (core instanceof ZodSet) {
    attribute = builder.instance(Set as any, prop as any);
    attribute.list(resolved.refs as any, "Set");
    applySetChecks(attribute, core);
  } else if (core instanceof ZodString) {
    attribute = builder.string(prop as any);
    attribute.type(String);
    applyStringChecks(attribute, core);
  } else if (core instanceof ZodNumber) {
    attribute = builder.number(prop as any);
    attribute.type(Number);
    applyNumberChecks(attribute, core);
  } else if (core instanceof ZodBoolean) {
    attribute = builder.instance(Boolean as any, prop as any);
    attribute.type(Boolean as any);
  } else if (core instanceof ZodBigInt) {
    attribute = builder.bigint(prop as any);
    attribute.type(BigInt as any);
  } else if (core instanceof ZodDate) {
    attribute = builder.date(prop as any);
    attribute.type(Date);
    applyDateChecks(attribute, core);
  } else if (resolved.refs.length) {
    attribute = builder.instance(Object as any, prop as any);
    attribute.type(
      (resolved.refs.length === 1 ? resolved.refs[0] : resolved.refs) as any
    );
  } else {
    attribute = builder.instance(Object as any, prop as any);
  }

  if (description) attribute.description(description);
  if (!optional) attribute.required();
}

function buildModelFromSchema(
  schema: ZodObject<any>,
  ctx: ZodToModelContext,
  explicitName?: string,
  path: string[] = []
) {
  const state = getBuildState(schema, ctx);
  if (state.ctor) return state.ctor;

  ctx.inProgress.add(schema);
  const builder = ModelBuilder.builder<BuildableModel>();
  const name = ensureCtorName(
    schema,
    modelNameForPath(path, `GeneratedModel${++ctx.sequence}`),
    explicitName
  );
  builder.setName(name);

  const description = schemaDescription(schema);
  if (description) {
    builder.description(description);
  }

  for (const [prop, propSchema] of Object.entries(schema.shape)) {
    applySchemaToAttribute(builder, prop, propSchema as ZodTypeAny, ctx, [
      ...path,
      prop,
    ]);
  }

  const ctor = builder.build();
  state.ctor = ctor;

  ctx.inProgress.delete(schema);
  attachSchemaModelName(schema, ctor.name);
  return ctor;
}

export function zodToModel<M extends Model>(
  schema: ZodTypeAny,
  name?: string
): Constructor<M> {
  if (!(schema instanceof ZodObject)) {
    throw new Error(
      `Zod-to-Model conversion requires a ZodObject at the root, received ${schema.constructor.name}`
    );
  }
  const ctx = createContext();
  const explicitName = ensureCtorName(
    schema,
    modelNameForPath([], `GeneratedModel${++ctx.sequence}`),
    name
  );
  return buildModelFromSchema(schema, ctx, explicitName);
}

const descriptor = Object.getOwnPropertyDescriptor(z, "from" as keyof typeof z);

if (!descriptor || descriptor.configurable) {
  Object.defineProperty(z, "from", {
    value: <M extends Model>(model: Constructor<M>) => {
      return modelToZod(model) as any;
    },
  });
}

const toModelDescriptor = Object.getOwnPropertyDescriptor(
  z,
  "toModel" as keyof typeof z
);

if (!toModelDescriptor || toModelDescriptor.configurable) {
  Object.defineProperty(z, "toModel", {
    value: <M extends Model>(schema: ZodTypeAny, name?: string) => {
      return zodToModel<M>(schema, name) as any;
    },
  });
}
